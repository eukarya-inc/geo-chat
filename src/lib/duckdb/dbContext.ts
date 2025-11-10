import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SQLHistoryManager } from './sqlHistoryManager';
import { convertArrowToJS } from '../../utils/arrowConverter';
import { detectCreateTableFromUrl, generateTableNameFromUrl, getFromClauseForUrl } from './tableUrlHelpers';
import { removeBOM, hasBOM } from '../../utils/bomUtils';

export interface DBContext {
    // Create a new connection for a specific schema
    // IMPORTANT: Caller must call destroy() on the returned connection when done
    createUnmanagedConnection(schema: string | null): Promise<AsyncDuckDBConnection>;
    forceConsistency(): Promise<void>;
    notifyTableChange(tableName?: string, schema?: string | null): void;
    onTableChange(callback: (tableName?: string, schema?: string | null) => void): () => void;
    executeWithRefresh<T>(operation: () => Promise<T>, tableName?: string): Promise<T>;
    validateTable(tableName: string, schema?: string | null): Promise<boolean>;
    getTables(schema?: string | null): Promise<string[]>;
    getTableColumns(tableName: string, schema?: string | null): Promise<Array<{ name: string; type: string }>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    executeQuery(sql: string, schema?: string | null): Promise<any[]>;
    getSQLHistory(): SQLHistoryManager;
    dropTable(tableName: string, schema?: string | null): Promise<void>;
    describeTable(
        tableName: string,
        schema?: string | null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Array<{ column_name: string; column_type: string; [key: string]: any }>>;
    getPoolStats(): { schema: string | null; total: number; inUse: number }[];
    closeSchemaConnections(schema: string | null): Promise<void>;
    closeAllConnections(): Promise<void>;

    // Schema management methods
    createSchema(schemaName: string): Promise<void>;
    deleteSchema(schemaName: string): Promise<void>;

    // Export methods
    downloadTable(tableName: string, format: 'parquet' | 'csv' | 'json', schema?: string | null): Promise<Blob>;

    // Data loading methods
    createTableFromUrl(url: string, schema?: string | null, tableName?: string): Promise<string>;
}

interface PooledConnection {
    connection: AsyncDuckDBConnection;
    schema: string | null;
    inUse: boolean;
    lastUsed: number;
    schemaInitialized: boolean;
}

class DatabaseContext implements DBContext {
    private db: AsyncDuckDB;
    private tableChangeCallbacks: Set<(tableName?: string, schema?: string | null) => void> = new Set();
    private refreshDebounceTimeout: NodeJS.Timeout | null = null;
    private sqlHistory: SQLHistoryManager;
    private debugLogging = false; // Set to true to enable debug logs
    private isInMemory = true; // Track if database is in-memory mode

    // Connection pool: Map<schema, PooledConnection[]>
    private connectionPool: Map<string | null, PooledConnection[]> = new Map();
    private maxConnectionsPerSchema = 10; // Increased from 3 to avoid deadlock
    private maxIdleTime = 60000; // 60 seconds
    private connectionMutex: Promise<void> = Promise.resolve();
    private cleanupTimer: NodeJS.Timeout | null = null;
    // Round-robin index for each schema
    private roundRobinIndex: Map<string | null, number> = new Map();
    // Event-driven connection wait queue: Map<schema, Array<resolve function>>
    private connectionWaitQueue: Map<string | null, Array<(conn: AsyncDuckDBConnection) => void>> = new Map();

    constructor(db: AsyncDuckDB, isInMemory = true, maxConnectionsPerSchema = 10) {
        this.db = db;
        this.isInMemory = isInMemory;
        this.maxConnectionsPerSchema = maxConnectionsPerSchema;
        this.sqlHistory = new SQLHistoryManager();

        // Start cleanup timer for idle connections
        this.cleanupTimer = setInterval(() => this.cleanupIdleConnections(), 30000); // Every 30 seconds
    }

    private async cleanupIdleConnections(): Promise<void> {
        const now = Date.now();

        for (const [schema, connections] of this.connectionPool.entries()) {
            const toRemove: PooledConnection[] = [];

            for (const pooledConn of connections) {
                if (!pooledConn.inUse && now - pooledConn.lastUsed > this.maxIdleTime) {
                    toRemove.push(pooledConn);
                }
            }

            for (const pooledConn of toRemove) {
                try {
                    await pooledConn.connection.close();
                } catch {
                    // Ignore errors when closing idle connections
                }
                const index = connections.indexOf(pooledConn);
                if (index > -1) {
                    connections.splice(index, 1);
                }
            }

            // Remove schema entry if no connections remain
            if (connections.length === 0) {
                this.connectionPool.delete(schema);
            }
        }
    }

    // Helper method to execute checkpoint only for persistent databases
    private async executeCheckpoint(conn: AsyncDuckDBConnection): Promise<void> {
        if (this.isInMemory) {
            // Skip checkpoint for in-memory databases
            return;
        }

        try {
            await conn.query('CHECKPOINT;');
            try {
                await conn.query('PRAGMA force_checkpoint;');
            } catch {
                // force_checkpoint might not be available in all versions
            }
        } catch {
            // Checkpoint failed (non-critical for most operations)
        }
    }

    async closeAllConnections(): Promise<void> {
        if (this.debugLogging) {
            console.log('[DBContext] closeAllConnections: Starting cleanup');
            console.log('[DBContext] Current pool stats:', this.getPoolStats());
        }

        let totalClosed = 0;
        for (const [schema, connections] of this.connectionPool.entries()) {
            if (this.debugLogging) {
                console.log(`[DBContext] Closing ${connections.length} connections for schema: ${schema}`);
            }
            for (const pooledConn of connections) {
                try {
                    await pooledConn.connection.close();
                    totalClosed++;
                } catch (err) {
                    if (this.debugLogging) {
                        console.error(`[DBContext] Error closing connection for schema ${schema}:`, err);
                    }
                }
            }
        }
        this.connectionPool.clear();

        if (this.debugLogging) {
            console.log(`[DBContext] closeAllConnections: Closed ${totalClosed} connections total`);
        }
    }

    // Sanitize schema name to be valid SQL identifier
    private sanitizeSchemaName(schema: string | null): string | null {
        if (!schema) return null;
        // Replace all non-alphanumeric characters with underscores
        // Ensure it starts with a letter or underscore (not a number)
        let sanitized = schema.replace(/[^a-zA-Z0-9_]/g, '_');
        // If it starts with a number, prefix with underscore
        if (/^\d/.test(sanitized)) {
            sanitized = `_${sanitized}`;
        }
        return sanitized;
    }

    // Create an unmanaged connection that must be manually destroyed
    // Caller is responsible for calling destroy() when done
    async createUnmanagedConnection(schema: string | null): Promise<AsyncDuckDBConnection> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);
        return this.connect(sanitizedSchema);
    }

    private async connect(schema: string | null): Promise<AsyncDuckDBConnection> {
        const connectStartTime = Date.now();
        // Sanitize schema name if provided
        const sanitizedSchema = this.sanitizeSchemaName(schema);

        if (this.debugLogging) {
            console.log(`[connect] Requesting connection for schema: ${sanitizedSchema}`);
        }

        // Use mutex to prevent concurrent connection creation
        await this.connectionMutex;
        if (this.debugLogging) {
            console.log(`[connect] Mutex acquired after ${Date.now() - connectStartTime}ms`);
        }

        const connectionPromise = (async () => {
            try {
                // Get or create connection pool for this schema
                if (!this.connectionPool.has(sanitizedSchema)) {
                    this.connectionPool.set(sanitizedSchema, []);
                }

                const schemaConnections = this.connectionPool.get(sanitizedSchema)!;

                // Try to find an available connection using round-robin
                // This ensures better load distribution across connections
                const availableConnections = schemaConnections.filter(
                    conn => !conn.inUse && conn.schema === sanitizedSchema
                );

                if (availableConnections.length > 0) {
                    // Get or initialize round-robin index for this schema
                    const currentIndex = this.roundRobinIndex.get(sanitizedSchema) || 0;
                    const selectedIndex = currentIndex % availableConnections.length;
                    const pooledConn = availableConnections[selectedIndex];

                    // Update round-robin index for next call
                    this.roundRobinIndex.set(sanitizedSchema, (currentIndex + 1) % availableConnections.length);

                    pooledConn.inUse = true;
                    pooledConn.lastUsed = Date.now();

                    if (this.debugLogging) {
                        console.log(
                            `[connect] Reusing connection ${selectedIndex + 1}/${availableConnections.length} (round-robin) after ${Date.now() - connectStartTime}ms`
                        );
                    }

                    // Ensure schema is set correctly for reused connection
                    if (sanitizedSchema && !pooledConn.schemaInitialized) {
                        try {
                            if (this.debugLogging) {
                                console.log(`[connect] Initializing schema for reused connection`);
                            }
                            // Ensure schema exists and is set (with proper escaping)
                            await pooledConn.connection.query(`CREATE SCHEMA IF NOT EXISTS "${sanitizedSchema}"`);
                            await pooledConn.connection.query(`SET search_path = "${sanitizedSchema}"`);
                            pooledConn.schemaInitialized = true;
                        } catch (error) {
                            console.warn(`Failed to set schema for reused connection: ${error}`);
                            // Continue anyway - connection might still be usable
                        }
                    }

                    // Create a wrapper that returns the connection to the pool
                    const wrappedConnection = this.createWrappedConnection(pooledConn);
                    return wrappedConnection;
                }

                // No available connection, create a new one if under limit
                if (schemaConnections.length < this.maxConnectionsPerSchema) {
                    if (this.debugLogging) {
                        console.log(`[connect] Creating new connection`);
                    }
                    const connCreateTime = Date.now();
                    const conn = await this.db.connect();
                    if (this.debugLogging) {
                        console.log(`[connect] New connection created in ${Date.now() - connCreateTime}ms`);
                    }

                    // Set schema if specified
                    if (sanitizedSchema) {
                        try {
                            if (this.debugLogging) {
                                console.log(`[connect] Setting up schema for new connection`);
                            }
                            const schemaSetupTime = Date.now();
                            // First ensure the schema exists (with proper escaping)
                            await conn.query(`CREATE SCHEMA IF NOT EXISTS "${sanitizedSchema}"`);
                            // Then set it as the current schema
                            await conn.query(`SET search_path = "${sanitizedSchema}"`);
                            if (this.debugLogging) {
                                console.log(`[connect] Schema setup completed in ${Date.now() - schemaSetupTime}ms`);
                            }
                        } catch (error) {
                            await conn.close();
                            throw new Error(`Failed to set schema ${sanitizedSchema}: ${error}`);
                        }
                    }

                    const pooledConn: PooledConnection = {
                        connection: conn,
                        schema: sanitizedSchema,
                        inUse: true,
                        lastUsed: Date.now(),
                        schemaInitialized: !!sanitizedSchema,
                    };

                    schemaConnections.push(pooledConn);

                    // Create a wrapper that returns the connection to the pool
                    const wrappedConnection = this.createWrappedConnection(pooledConn);
                    if (this.debugLogging) {
                        console.log(`[connect] Total connection time: ${Date.now() - connectStartTime}ms`);
                    }
                    return wrappedConnection;
                }

                // Pool is full, wait for an available connection using event-driven approach
                if (this.debugLogging) {
                    const poolStats = schemaConnections.map((c, i) => `#${i}:${c.inUse ? 'busy' : 'free'}`).join(', ');
                    console.log(
                        `[connect] Pool is full for schema ${sanitizedSchema} (${schemaConnections.length}/${this.maxConnectionsPerSchema}), waiting for available connection... Pool state: [${poolStats}]`
                    );
                }

                // Create a promise that will be resolved when a connection becomes available
                const waitStartTime = Date.now();
                const connectionPromise = new Promise<AsyncDuckDBConnection>((resolve, reject) => {
                    // Add to wait queue
                    if (!this.connectionWaitQueue.has(sanitizedSchema)) {
                        this.connectionWaitQueue.set(sanitizedSchema, []);
                    }
                    this.connectionWaitQueue.get(sanitizedSchema)!.push(resolve);

                    // Set timeout (30 seconds)
                    setTimeout(() => {
                        // Remove from queue if still waiting
                        const queue = this.connectionWaitQueue.get(sanitizedSchema);
                        if (queue) {
                            const index = queue.indexOf(resolve);
                            if (index !== -1) {
                                queue.splice(index, 1);
                                reject(
                                    new Error(`Connection wait timeout after 30 seconds for schema ${sanitizedSchema}`)
                                );
                            }
                        }
                    }, 30000);
                });

                // Wait for connection to be released
                const conn = await connectionPromise;
                if (this.debugLogging) {
                    console.log(`[connect] Got connection after waiting ${Date.now() - waitStartTime}ms`);
                }
                return conn;
            } catch (error) {
                console.error('DBContext: Failed to get connection from pool:', error);
                throw error;
            }
        })();

        // Update mutex for next call
        this.connectionMutex = connectionPromise.then(
            () => {},
            () => {}
        );

        return connectionPromise;
    }

    private createWrappedConnection(pooledConn: PooledConnection): AsyncDuckDBConnection {
        const conn = pooledConn.connection;

        // Create a proxy to intercept the close method
        return new Proxy(conn, {
            get: (target, prop) => {
                if (prop === 'close') {
                    return async () => {
                        if (this.debugLogging) {
                            console.log(`[connection close] Releasing connection for schema ${pooledConn.schema}`);
                        }

                        // Return connection to pool instead of closing
                        pooledConn.inUse = false;
                        pooledConn.lastUsed = Date.now();

                        // Notify waiting requests (event-driven)
                        const queue = this.connectionWaitQueue.get(pooledConn.schema);
                        if (queue && queue.length > 0) {
                            // Get first waiting request (FIFO)
                            const resolve = queue.shift()!;
                            // Mark connection as in use again
                            pooledConn.inUse = true;
                            // Create wrapped connection and resolve the waiting promise
                            const wrappedConn = this.createWrappedConnection(pooledConn);
                            if (this.debugLogging) {
                                console.log(
                                    `[connection release] Notified waiting request for schema ${pooledConn.schema}, ${queue.length} remaining in queue`
                                );
                            }
                            resolve(wrappedConn);
                        } else {
                            if (this.debugLogging) {
                                console.log(
                                    `[connection release] No waiting requests for schema ${pooledConn.schema}, connection returned to pool`
                                );
                            }
                        }

                        // Don't actually close the connection
                        return Promise.resolve();
                    };
                }
                return target[prop as keyof AsyncDuckDBConnection];
            },
        });
    }

    async forceConsistency(): Promise<void> {
        const conn = await this.connect(null);
        try {
            // Execute checkpoint only for persistent databases
            await this.executeCheckpoint(conn);
            // Database consistency enforced
        } catch {
            // DB consistency checkpoint failed (non-critical)
        } finally {
            await conn.close();
        }
    }

    notifyTableChange(tableName?: string, schema?: string | null): void {
        // DISABLED DEBOUNCING - Execute immediately to test if debouncing was causing issues
        // Notifying table change to listeners
        this.tableChangeCallbacks.forEach(callback => {
            try {
                callback(tableName, schema);
            } catch (error) {
                console.error('Table change callback error:', error);
            }
        });
    }

    onTableChange(callback: (tableName?: string, schema?: string | null) => void): () => void {
        this.tableChangeCallbacks.add(callback);
        return () => {
            this.tableChangeCallbacks.delete(callback);
        };
    }

    async executeWithRefresh<T>(operation: () => Promise<T>, tableName?: string): Promise<T> {
        try {
            // Executing DDL operation
            const result = await operation();

            // Force consistency after DDL operation
            await this.forceConsistency();

            // Validate table if specified
            if (tableName) {
                const isValid = await this.validateTable(tableName, null);
                if (!isValid) {
                    console.error(`DBContext: Table ${tableName} validation failed after operation`);
                    // Try one more sync
                    await this.forceConsistency();
                }
            }

            // Notify table change immediately
            this.notifyTableChange(tableName, null);

            return result;
        } catch (error) {
            console.error('DBContext: Operation failed:', error);
            throw error;
        }
    }

    async validateTable(tableName: string, schema: string | null = null): Promise<boolean> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);

        try {
            const conn = await this.connect(sanitizedSchema);
            try {
                // Query tables from the specified schema
                const schemaName = sanitizedSchema || 'main';
                const tablesResult = await conn.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = '${schemaName}'
            AND table_type = 'BASE TABLE'
        `);
                const tableNames: string[] = [];
                for (let i = 0; i < tablesResult.numRows; i++) {
                    tableNames.push(tablesResult.getChildAt(0)?.get(i) as string);
                }

                if (!tableNames.includes(tableName)) {
                    // Table not found - this is an expected case when switching schemas
                    return false;
                }

                // Then try to access it
                await conn.query(`SELECT 1 FROM ${tableName} LIMIT 0`);
                // Table validated successfully
                return true;
            } finally {
                await conn.close();
            }
        } catch (error) {
            // Check if this is a memory access error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('memory access out of bounds')) {
                console.error(`DBContext: Memory access error when validating table ${tableName}.`);
            }
            // Table doesn't exist or can't be accessed
            return false;
        }
    }

    async getTables(schema: string | null = null): Promise<string[]> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);

        const conn = await this.connect(sanitizedSchema);

        try {
            // Query tables from the specified schema
            const schemaName = sanitizedSchema || 'main';
            const result = await conn.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = '${schemaName}'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
            const tableNames: string[] = [];
            for (let i = 0; i < result.numRows; i++) {
                tableNames.push(result.getChildAt(0)?.get(i) as string);
            }

            // Retrieved tables from current schema
            return tableNames;
        } catch (error) {
            // Check if this is a memory access error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('memory access out of bounds')) {
                console.error('DBContext: Memory access error when retrieving tables');
                return []; // Return empty array on memory error
            }
            throw error;
        } finally {
            await conn.close();
        }
    }

    async getTableColumns(
        tableName: string,
        schema: string | null = null
    ): Promise<Array<{ name: string; type: string }>> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);
        if (!(await this.validateTable(tableName, schema))) {
            throw new Error(`Table '${tableName}' does not exist or is not accessible`);
        }

        const conn = await this.connect(sanitizedSchema);
        try {
            const result = await conn.query(`DESCRIBE ${tableName}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return result.toArray().map((row: any) => ({
                name: row.column_name as string,
                type: row.column_type as string,
            }));
        } catch (error) {
            // Check if this is a memory access error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('memory access out of bounds')) {
                console.error(`DBContext: Memory access error when describing table ${tableName}`);
                throw new Error(
                    `Memory access error when accessing table '${tableName}'. The schema context may be corrupted.`
                );
            }
            throw error;
        } finally {
            await conn.close();
        }
    }

    // Helper function to check if SQL is a DDL operation
    private isDDLOperation(sql: string): boolean {
        const upperSql = sql.trim().toUpperCase();
        return (
            upperSql.includes('CREATE TABLE') ||
            upperSql.includes('CREATE OR REPLACE TABLE') ||
            upperSql.includes('DROP TABLE') ||
            upperSql.includes('ALTER TABLE') ||
            upperSql.includes('CREATE SCHEMA') ||
            upperSql.includes('DROP SCHEMA') ||
            upperSql.includes('CREATE INDEX') ||
            upperSql.includes('DROP INDEX')
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async executeQuery(sql: string, schema: string | null = null): Promise<any[]> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);

        // Intercept SHOW TABLES to make it schema-aware and fast
        const upperSql = sql.trim().toUpperCase();
        if (upperSql === 'SHOW TABLES' || upperSql === 'SHOW TABLES;') {
            // Use the optimized getTables method instead
            const tables = await this.getTables(schema);
            return tables.map(name => ({ name }));
        }

        // Check if this is a CREATE TABLE FROM URL pattern
        const urlTableInfo = detectCreateTableFromUrl(sql);
        if (urlTableInfo) {
            // Use createTableFromUrl with the specified table name for better URL handling
            await this.createTableFromUrl(urlTableInfo.url, sanitizedSchema, urlTableInfo.tableName);
            return [];
        }

        const conn = await this.connect(sanitizedSchema);
        try {
            const result = await conn.query(sql);

            // Extract column type information from Arrow schema
            const columnTypes = new Map<string, string>();
            if (result.schema && result.schema.fields) {
                for (const field of result.schema.fields) {
                    // Get the field name and type
                    const fieldName = field.name;
                    const fieldType = field.type?.toString() || '';
                    columnTypes.set(fieldName, fieldType);
                }
            }

            // Convert Arrow format data to JavaScript objects
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = result.toArray().map((row: any) => {
                return convertArrowToJS(row, columnTypes);
            });

            // For DDL operations, force checkpoint to ensure changes are persisted
            if (this.isDDLOperation(sql)) {
                await this.executeCheckpoint(conn);
            }

            // Query execution completed
            return data;
        } catch (error) {
            // Check if this is a memory access error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('memory access out of bounds')) {
                console.error('DBContext: Memory access error during query execution');
                throw new Error('Memory access error during query execution. The schema context may be corrupted.');
            }
            console.error('DBContext: Query failed:', sql, error);
            throw error;
        } finally {
            await conn.close();
        }
    }

    getSQLHistory(): SQLHistoryManager {
        return this.sqlHistory;
    }

    async dropTable(tableName: string, schema: string | null = null): Promise<void> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);
        console.log(`[DBContext] Dropping table: ${sanitizedSchema ? `${sanitizedSchema}.` : ''}${tableName}`);

        const conn = await this.connect(sanitizedSchema);
        try {
            await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);

            // Force checkpoint to ensure changes are persisted
            await this.executeCheckpoint(conn);

            // Notify listeners that the table was dropped
            this.notifyTableChange(tableName, schema);
        } catch (error) {
            console.error(`[DBContext] Failed to drop table ${tableName}:`, error);
            throw new Error(`Failed to drop table ${tableName}: ${error instanceof Error ? error.message : error}`);
        }
        // DO NOT close the connection - it's returned to the pool automatically
    }

    async describeTable(
        tableName: string,
        schema: string | null = null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Array<{ column_name: string; column_type: string; [key: string]: any }>> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);
        const conn = await this.connect(sanitizedSchema);
        try {
            const result = await conn.query(`DESCRIBE "${tableName}"`);
            return result.toArray();
        } finally {
            await conn.close();
        }
    }

    getPoolStats(): { schema: string | null; total: number; inUse: number }[] {
        const stats: { schema: string | null; total: number; inUse: number }[] = [];

        for (const [schema, connections] of this.connectionPool.entries()) {
            const inUse = connections.filter(c => c.inUse).length;
            stats.push({
                schema: schema,
                total: connections.length,
                inUse: inUse,
            });
        }

        return stats;
    }

    async closeSchemaConnections(schema: string | null): Promise<void> {
        const connections = this.connectionPool.get(schema);
        if (!connections) return;

        // Close all connections for this schema
        for (const pooledConn of connections) {
            try {
                // Force close the actual connection, bypassing the proxy
                const actualConn = pooledConn.connection;
                await actualConn.close();
            } catch {
                // Ignore errors when closing connections
            }
        }

        // Remove from pool
        this.connectionPool.delete(schema);
    }

    // Schema management methods
    async createSchema(schemaName: string): Promise<void> {
        const sanitizedSchema = this.sanitizeSchemaName(schemaName);
        if (!sanitizedSchema) {
            throw new Error('Invalid schema name');
        }

        const conn = await this.createUnmanagedConnection(null);
        try {
            await conn.query(`CREATE SCHEMA IF NOT EXISTS "${sanitizedSchema}"`);
            console.log(`DBContext: Created schema ${sanitizedSchema}`);
        } finally {
            await conn.close();
        }
    }

    async deleteSchema(schemaName: string): Promise<void> {
        const sanitizedSchema = this.sanitizeSchemaName(schemaName);
        if (!sanitizedSchema) {
            throw new Error('Invalid schema name');
        }

        const conn = await this.createUnmanagedConnection(null);
        try {
            // First switch to main schema to avoid dropping the current schema
            await conn.query(`SET search_path = "main"`);
            // Then drop the schema
            await conn.query(`DROP SCHEMA IF EXISTS "${sanitizedSchema}" CASCADE`);
            console.log(`DBContext: Deleted schema ${sanitizedSchema}`);
        } finally {
            await conn.close();
        }
    }

    async downloadTable(
        tableName: string,
        format: 'parquet' | 'csv' | 'json',
        schema: string | null = null
    ): Promise<Blob> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);

        // Validate table exists
        if (!(await this.validateTable(tableName, schema))) {
            throw new Error(`Table '${tableName}' does not exist or is not accessible`);
        }

        const conn = await this.connect(sanitizedSchema);
        try {
            const fullTableName = sanitizedSchema ? `"${sanitizedSchema}"."${tableName}"` : `"${tableName}"`;

            switch (format) {
                case 'parquet': {
                    // Create Parquet file in DuckDB's virtual file system
                    const fileName = `/tmp/${tableName}_${Date.now()}.parquet`;
                    await conn.query(`
            COPY ${fullTableName} 
            TO '${fileName}' 
            (FORMAT PARQUET)
          `);

                    // Read the file back as binary data
                    const result = await conn.query(`
            SELECT * FROM read_blob('${fileName}')
          `);

                    // Extract binary data from result
                    const binaryData = result.getChildAt(0)?.get(0);
                    if (!binaryData) {
                        throw new Error('Failed to read Parquet data');
                    }

                    // Clean up the temporary file
                    try {
                        await conn.query(`CALL remove('${fileName}')`);
                    } catch {
                        // Ignore cleanup errors
                    }

                    return new Blob([binaryData], { type: 'application/octet-stream' });
                }

                case 'csv': {
                    // Export as CSV
                    const result = await conn.query(`
            SELECT * FROM ${fullTableName}
          `);

                    // Convert result to CSV format
                    const data = result.toArray();
                    if (data.length === 0) {
                        return new Blob([''], { type: 'text/csv' });
                    }

                    // Get column names
                    const columns = Object.keys(data[0]);
                    const csvRows: string[] = [];

                    // Add header
                    csvRows.push(columns.map(col => `"${col}"`).join(','));

                    // Add data rows
                    for (const row of data) {
                        const values = columns.map(col => {
                            const value = row[col];
                            if (value === null || value === undefined) {
                                return '';
                            }
                            // Escape quotes and wrap in quotes if needed
                            const strValue = String(value);
                            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                                return `"${strValue.replace(/"/g, '""')}"`;
                            }
                            return strValue;
                        });
                        csvRows.push(values.join(','));
                    }

                    return new Blob([csvRows.join('\n')], { type: 'text/csv' });
                }

                case 'json': {
                    // Export as JSON
                    const result = await conn.query(`
            SELECT * FROM ${fullTableName}
          `);

                    const data = result.toArray();
                    const jsonStr = JSON.stringify(data, null, 2);

                    return new Blob([jsonStr], { type: 'application/json' });
                }

                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
        } finally {
            await conn.close();
        }
    }

    // Data loading methods
    async createTableFromUrl(url: string, schema: string | null = null, tableName?: string): Promise<string> {
        const sanitizedSchema = this.sanitizeSchemaName(schema);

        // Use provided table name or generate from URL
        const finalTableName = tableName || generateTableNameFromUrl(url);

        // Check if table already exists
        const existingTables = await this.getTables(sanitizedSchema);
        if (existingTables.includes(finalTableName)) {
            throw new Error(
                `テーブル "${finalTableName}" は既に存在します。同じデータを再度インポートする場合は、既存のテーブルを削除してから再試行してください。`
            );
        }

        // Determine file type and create appropriate FROM clause
        const from = getFromClauseForUrl(url);

        // Create the table directly without going through executeQuery to avoid recursion
        // Quote table name to support CJK and other special characters
        const createTableSQL = `CREATE TABLE "${finalTableName}" AS SELECT * FROM ${from}`;
        const conn = await this.connect(sanitizedSchema);
        try {
            await conn.query(createTableSQL);

            // Force checkpoint for DDL operation
            await this.executeCheckpoint(conn);

            // Check for BOM in column names and fix them
            const columns = await this.getTableColumns(finalTableName, sanitizedSchema);
            const columnsWithBOM = columns.filter(col => hasBOM(col.name));

            if (columnsWithBOM.length > 0) {
                console.log(`[DBContext] Found BOM in column names for table ${finalTableName}, fixing...`);

                // Create a new table with cleaned column names
                const cleanedColumns = columns.map(col => ({
                    name: removeBOM(col.name),
                    originalName: col.name,
                }));

                // Build the SELECT statement with renamed columns
                const selectList = cleanedColumns
                    .map(col =>
                        col.name !== col.originalName ? `"${col.originalName}" AS "${col.name}"` : `"${col.name}"`
                    )
                    .join(', ');

                // Create temporary table with clean column names
                const tempTableName = `${finalTableName}_temp`;
                const recreateSQL = `CREATE TABLE "${tempTableName}" AS SELECT ${selectList} FROM "${finalTableName}"`;

                await conn.query(recreateSQL);

                // Drop the original table and rename temp table
                await conn.query(`DROP TABLE "${finalTableName}"`);
                await conn.query(`ALTER TABLE "${tempTableName}" RENAME TO "${finalTableName}"`);

                console.log(`[DBContext] Fixed BOM in ${columnsWithBOM.length} column(s)`);
            }
        } finally {
            await conn.close();
        }

        // Record in SQL history
        const formattedSQL = createTableSQL; // You may want to format this
        this.sqlHistory.recordCreateTable(finalTableName, formattedSQL, 'remote-file', undefined, sanitizedSchema);

        // Notify about table change
        this.notifyTableChange(finalTableName, sanitizedSchema);

        return finalTableName;
    }

    // Clean up resources when the context is destroyed
    async destroy(): Promise<void> {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        if (this.refreshDebounceTimeout) {
            clearTimeout(this.refreshDebounceTimeout);
            this.refreshDebounceTimeout = null;
        }

        await this.closeAllConnections();
    }
}

export function createDBContext(db: AsyncDuckDB, isInMemory = true, maxConnectionsPerSchema = 10): DBContext {
    return new DatabaseContext(db, isInMemory, maxConnectionsPerSchema);
}

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { DBContext } from './dbContext';

export class SchemaManager {
    private dbContext: DBContext;
    private currentSchema: string | null = null;

    constructor(dbContext: DBContext) {
        this.dbContext = dbContext;
    }

    /**
     * Create a new schema for a chat
     */
    async createSchema(chatId: string): Promise<void> {
        const schemaName = this.getSchemaName(chatId);
        const conn = await this.dbContext.createManagedConnection(null);
        try {
            await conn.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            console.log(`SchemaManager: Created schema ${schemaName}`);
        } finally {
            await conn.close();
        }
    }

    /**
     * Switch to a specific chat's schema
     */
    async switchToSchema(chatId: string): Promise<void> {
        const schemaName = this.getSchemaName(chatId);
        const conn = await this.dbContext.createManagedConnection(null);
        try {
            // First ensure the schema exists
            await conn.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            // Then set it as the current schema
            await conn.query(`SET search_path = "${schemaName}"`);
            this.currentSchema = schemaName;
            console.log(`SchemaManager: Switched to schema ${schemaName}`);
        } finally {
            await conn.close();
        }
    }

    /**
     * Delete a schema and all its contents
     */
    async deleteSchema(chatId: string): Promise<void> {
        const schemaName = this.getSchemaName(chatId);
        const conn = await this.dbContext.createManagedConnection(null);
        try {
            // First switch to main schema to avoid dropping the current schema
            await conn.query(`SET search_path = "main"`);
            // Then drop the schema
            await conn.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
            console.log(`SchemaManager: Deleted schema ${schemaName}`);
            
            if (this.currentSchema === schemaName) {
                this.currentSchema = null;
            }
        } finally {
            await conn.close();
        }
    }

    /**
     * Get all tables in the current schema
     */
    async getTablesInCurrentSchema(): Promise<string[]> {
        if (!this.currentSchema) {
            return [];
        }

        const conn = await this.dbContext.createManagedConnection(null);
        try {
            // Set search path to current schema
            await conn.query(`SET search_path = '${this.currentSchema}'`);
            
            // Query tables specifically from the current schema
            const result = await conn.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = '${this.currentSchema}'
                AND table_type = 'BASE TABLE'
            `);
            
            const tables: string[] = [];
            for (let i = 0; i < result.numRows; i++) {
                tables.push(result.getChildAt(0)?.get(i) as string);
            }
            
            return tables;
        } finally {
            await conn.close();
        }
    }

    /**
     * Copy a table from main schema to current schema
     */
    async copyTableFromMain(tableName: string): Promise<void> {
        if (!this.currentSchema) {
            throw new Error('No schema is currently selected');
        }

        const conn = await this.dbContext.createManagedConnection(null);
        try {
            // Create table in current schema as a copy of the main schema table
            await conn.query(`
                CREATE TABLE IF NOT EXISTS ${this.currentSchema}.${tableName} AS 
                SELECT * FROM main.${tableName}
            `);
            console.log(`SchemaManager: Copied table ${tableName} from main to ${this.currentSchema}`);
        } finally {
            await conn.close();
        }
    }

    /**
     * Get the current schema name
     */
    getCurrentSchema(): string | null {
        return this.currentSchema;
    }

    /**
     * Execute a query in the current schema context
     */
    async executeInSchema<T>(queryFn: (conn: AsyncDuckDBConnection) => Promise<T>): Promise<T> {
        const conn = await this.dbContext.createManagedConnection(null);
        try {
            if (this.currentSchema) {
                await conn.query(`SET search_path = "${this.currentSchema}"`);
            }
            return await queryFn(conn);
        } finally {
            await conn.close();
        }
    }

    /**
     * Generate schema name from chat ID
     */
    getSchemaName(chatId: string): string {
        // Replace any special characters that might cause issues in SQL
        return `chat_${chatId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }

    /**
     * Reset to main schema
     */
    async resetToMain(): Promise<void> {
        const conn = await this.dbContext.createManagedConnection(null);
        try {
            await conn.query(`SET search_path = "main"`);
            this.currentSchema = null;
            console.log('SchemaManager: Reset to main schema');
        } finally {
            await conn.close();
        }
    }
}

export function createSchemaManager(dbContext: DBContext): SchemaManager {
    return new SchemaManager(dbContext);
}
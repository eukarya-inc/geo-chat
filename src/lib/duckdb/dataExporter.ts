import type { DBContext } from './dbContext';

/**
 * Configuration for data export
 */
export interface DataExportConfig {
    /** SQL query to execute */
    sql: string;
    /** Schema name to use for the query */
    schema?: string | null;
    /** Optional row limit for the query */
    limit?: number;
}

/**
 * Result of data export
 */
export interface DataExportResult {
    /** Object URL pointing to the JSON data */
    url: string;
    /** Number of rows exported */
    rowCount: number;
    /** Size of the JSON blob in bytes */
    sizeBytes: number;
    /** Cleanup function to revoke the Object URL */
    cleanup: () => void;
}

/**
 * Threshold for automatic URL mode (number of rows)
 */
export const LARGE_DATASET_THRESHOLD = 1000;

/**
 * Exports query results to a JSON Blob and returns an Object URL
 *
 * @param dbContext - DuckDB database context
 * @param config - Export configuration
 * @returns Promise resolving to export result with URL and cleanup function
 */
export async function exportDataAsJSON(dbContext: DBContext, config: DataExportConfig): Promise<DataExportResult> {
    const { sql, schema, limit } = config;

    // Apply limit if specified
    const finalSql = limit ? `${sql} LIMIT ${limit}` : sql;

    // Execute query
    const rows = await dbContext.executeQuery(finalSql, schema);

    // Convert to JSON string
    const jsonString = JSON.stringify(rows);

    // Create Blob
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create Object URL
    const url = URL.createObjectURL(blob);

    // Cleanup function
    const cleanup = () => {
        URL.revokeObjectURL(url);
    };

    return {
        url,
        rowCount: rows.length,
        sizeBytes: blob.size,
        cleanup,
    };
}

/**
 * Checks if a query result should use URL mode based on row count
 *
 * @param dbContext - DuckDB database context
 * @param sql - SQL query to check
 * @param schema - Schema name
 * @returns Promise resolving to true if URL mode should be used
 */
export async function shouldUseUrlMode(dbContext: DBContext, sql: string, schema?: string | null): Promise<boolean> {
    try {
        // Extract the main query without LIMIT
        const baseQuery = sql.replace(/\s+LIMIT\s+\d+\s*$/i, '');

        // Count rows
        const countQuery = `SELECT COUNT(*) as count FROM (${baseQuery}) t`;
        const result = await dbContext.executeQuery(countQuery, schema);

        const count = result[0]?.count as number | undefined;
        return (count ?? 0) >= LARGE_DATASET_THRESHOLD;
    } catch (error) {
        console.warn('Failed to check row count, defaulting to standard mode:', error);
        return false;
    }
}

/**
 * Manager for tracking and cleaning up Object URLs
 */
export class ObjectURLManager {
    private urls: Set<string> = new Set();

    /**
     * Registers an Object URL for tracking
     */
    register(url: string): void {
        this.urls.add(url);
    }

    /**
     * Revokes a specific Object URL
     */
    revoke(url: string): void {
        if (this.urls.has(url)) {
            URL.revokeObjectURL(url);
            this.urls.delete(url);
        }
    }

    /**
     * Revokes all tracked Object URLs
     */
    revokeAll(): void {
        this.urls.forEach(url => {
            URL.revokeObjectURL(url);
        });
        this.urls.clear();
    }

    /**
     * Returns the number of tracked URLs
     */
    get size(): number {
        return this.urls.size;
    }
}

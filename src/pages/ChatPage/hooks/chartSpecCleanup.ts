import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { ChatState } from '../../../store/remoteAtoms';

/**
 * Cleans up orphaned chartSpecs for tables that no longer exist in the database
 * @param chartSpecs Current chartSpecs object
 * @param dbContext Database context
 * @param schemaName Current schema name
 * @returns Cleaned chartSpecs object with only valid table references
 */
export async function cleanupOrphanedChartSpecs(
    chartSpecs: Record<string, unknown> | undefined,
    dbContext: DBContext | null,
    schemaName: string | null
): Promise<Record<string, unknown>> {
    if (!chartSpecs || !dbContext || !schemaName) {
        return chartSpecs || {};
    }

    try {
        // Get all tables in the current schema
        const existingTables = await dbContext.getTables(schemaName);
        const existingTableSet = new Set(existingTables);

        // Filter chartSpecs to only include tables that exist
        const cleanedChartSpecs: Record<string, unknown> = {};
        let removedCount = 0;

        for (const [tableName, spec] of Object.entries(chartSpecs)) {
            if (existingTableSet.has(tableName)) {
                cleanedChartSpecs[tableName] = spec;
            } else {
                removedCount++;
                console.log(`[ChartSpec Cleanup] Removing orphaned chartSpec for non-existent table: ${tableName}`);
            }
        }

        if (removedCount > 0) {
            console.log(
                `[ChartSpec Cleanup] Removed ${removedCount} orphaned chartSpec(s). Remaining: ${Object.keys(cleanedChartSpecs).length}`
            );
        }

        return cleanedChartSpecs;
    } catch (error) {
        console.error('[ChartSpec Cleanup] Error cleaning up chartSpecs:', error);
        // Return original chartSpecs if cleanup fails
        return chartSpecs;
    }
}

/**
 * Validates that all chartSpec keys correspond to existing tables
 * @param chatState Current chat state
 * @param dbContext Database context
 * @param schemaName Current schema name
 * @returns Validation result with list of orphaned chartSpecs
 */
export async function validateChartSpecs(
    chatState: ChatState | null,
    dbContext: DBContext | null,
    schemaName: string | null
): Promise<{
    isValid: boolean;
    orphanedChartSpecs: string[];
    existingTables: string[];
}> {
    const result = {
        isValid: true,
        orphanedChartSpecs: [] as string[],
        existingTables: [] as string[],
    };

    if (!chatState?.chartSpecs || !dbContext || !schemaName) {
        return result;
    }

    try {
        // Get all tables in the current schema
        const existingTables = await dbContext.getTables(schemaName);
        const existingTableSet = new Set(existingTables);
        result.existingTables = existingTables;

        // Check each chartSpec
        for (const tableName of Object.keys(chatState.chartSpecs)) {
            if (!existingTableSet.has(tableName)) {
                result.orphanedChartSpecs.push(tableName);
                result.isValid = false;
            }
        }

        if (!result.isValid) {
            console.warn(
                `[ChartSpec Validation] Found ${result.orphanedChartSpecs.length} orphaned chartSpec(s):`,
                result.orphanedChartSpecs
            );
        }

        return result;
    } catch (error) {
        console.error('[ChartSpec Validation] Error validating chartSpecs:', error);
        return result;
    }
}

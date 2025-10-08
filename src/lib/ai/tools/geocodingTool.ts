import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import {
    geocodeSingleAddress,
    geocodeMultipleAddresses,
    analyzeTableForGeocoding,
    addGeocodedColumnsToTable,
    type GeocodeResult,
} from '../../../utils/geocoding';

export type Result =
    | {
          error: string;
          suggestions?: string[];
      }
    | {
          success: boolean;
          data: GeocodeResult;
          message?: string;
          geometryInfo?: {
              columnName: string;
              geometryType: string;
              message: string;
          };
          suggestions?: string[];
      };

export function createGeocodingTools(dbContext: DBContext) {
    return {
        geocode_address: tool({
            description: `Geocode a single address using OpenStreetMap Nominatim API. Returns latitude, longitude and full address.`,
            parameters: z.object({
                address: z.string().describe('The address to geocode (e.g., "1600 Pennsylvania Avenue, Washington, DC")'),
            }),
            execute: async ({ address }): Promise<Result> => {
                try {
                    const result = await geocodeSingleAddress(address);
                    return {
                        success: true,
                        data: result,
                        message: `Successfully geocoded "${address}"`,
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        message: `Failed to geocode "${address}"`,
                    };
                }
            },
        }),

        geocode_multiple_addresses: tool({
            description: `Geocode multiple addresses with rate limiting. Useful for batch processing.`,
            parameters: z.object({
                addresses: z.array(z.string()).describe('Array of addresses to geocode'),
                rateLimitMs: z.number().optional().default(1000).describe('Milliseconds to wait between API calls (default: 1000)'),
            }),
            execute: async ({ addresses, rateLimitMs = 1000 }) => {
                try {
                    const { results, errors } = await geocodeMultipleAddresses(addresses, rateLimitMs);
                    return {
                        success: true,
                        data: { results, errors },
                        message: `Geocoded ${results.length} addresses successfully, ${errors.length} failed`,
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        message: 'Batch geocoding failed',
                    };
                }
            },
        }),

        analyze_table_for_geocoding: tool({
            description: `Analyze a DuckDB table to find columns that might contain addresses suitable for geocoding.`,
            parameters: z.object({
                tableName: z.string().describe('Name of the table to analyze'),
            }),
            execute: async ({ tableName }) => {
                try {
                    const analysis = await analyzeTableForGeocoding(dbContext, tableName);
                    return {
                        success: true,
                        data: analysis,
                        message: `Found ${analysis.addressColumns.length} potential address columns in table "${tableName}"`,
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        message: `Failed to analyze table "${tableName}"`,
                    };
                }
            },
        }),

        add_geocoded_columns_to_table: tool({
            description: `Add latitude, longitude, and display_name columns to a table by geocoding an existing address column. This modifies the table structure.`,
            parameters: z.object({
                tableName: z.string().describe('Name of the table to modify'),
                addressColumn: z.string().describe('Name of the column containing addresses'),
                batchSize: z.number().optional().default(10).describe('Number of addresses to process in each batch'),
                rateLimitMs: z.number().optional().default(1000).describe('Milliseconds to wait between API calls'),
            }),
            execute: async ({ tableName, addressColumn, batchSize = 10, rateLimitMs = 1000 }) => {
                try {
                    const result = await addGeocodedColumnsToTable(dbContext, tableName, addressColumn, batchSize, rateLimitMs);

                    if (!result.success || result.stats.successful < 0) {
                        throw new Error(result.message);
                    }

                    await dbContext.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS geocoded_geometry GEOMETRY;`, null);
                    await dbContext.executeQuery(
                        `UPDATE ${tableName} SET geocoded_geometry = ST_Point(geocoded_lng, geocoded_lat) WHERE geocoded_lat IS NOT NULL AND geocoded_lng IS NOT NULL;`,
                        null
                    );

                    return {
                        success: result.success,
                        data: result.stats,
                        message: result.message,
                        geometryInfo: {
                            columnName: 'geocoded_geometry',
                            geometryType: 'GEOMETRY(POINT)',
                            message: 'ジオメトリカラム「geocoded_geometry」が追加されました。このテーブルは地図での可視化が可能です。',
                        },
                        suggestions: ['地図スタイルを設定するには update_map_style_for_table ツールを使用してください。'],
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        message: `Failed to add geocoded columns to table "${tableName}"`,
                    };
                }
            },
        }),
    };
}

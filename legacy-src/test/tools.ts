import { vi } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { createDuckDBTool } from '../lib/ai/tools/duckdbTool';
import type { DBContext } from '../lib/duckdb/dbContext';

/**
 * Mock tool invocation tracking
 * Records all calls to each mock tool for test assertions
 */
export interface MockToolCalls {
    predictor: Array<Record<string, unknown>>;
    regression: Array<Record<string, unknown>>;
    cluster: Array<Record<string, unknown>>;
    segmentedRegression: Array<Record<string, unknown>>;
    geocode: Array<Record<string, unknown>>;
    chartUpdate: Array<{ tableName: string; spec: unknown }>;
    chartGet: Array<Record<string, unknown>>;
    chartDelete: Array<{ tableName: string }>;
    mapStyleUpdate: Array<{ tableName: string; style: unknown }>;
    mapStyleGet: Array<Record<string, unknown>>;
    completion: Array<Record<string, unknown>>;
}

/**
 * Create mock tools for testing AI stream integration
 *
 * Provides a complete set of mocked AI tools with call tracking.
 * The real DuckDB tool is included, while other tools return mock responses.
 *
 * @param dbContext - Database context for the real DuckDB tool
 * @returns Object containing tools and call tracking
 *
 * @example
 * ```typescript
 * const { tools, calls } = createMockTools(dbContext);
 *
 * // Use tools in AI stream
 * const generator = createAIStreamGenerator({ tools, ... });
 * await collectStream(generator);
 *
 * // Check tool invocations
 * expect(calls.chartUpdate).toHaveLength(1);
 * expect(calls.chartUpdate[0]).toEqual({ tableName: 'test', spec: {...} });
 * ```
 */
export function createMockTools(dbContext: DBContext) {
    // Track all tool invocations
    const calls: MockToolCalls = {
        predictor: [],
        regression: [],
        cluster: [],
        segmentedRegression: [],
        geocode: [],
        chartUpdate: [],
        chartGet: [],
        chartDelete: [],
        mapStyleUpdate: [],
        mapStyleGet: [],
        completion: [],
    };

    // Mock functions for internal operations
    const mockChartUpdate = vi.fn();
    const mockChartDelete = vi.fn();
    const mockMapStyleUpdate = vi.fn();
    const mockMapStyleDelete = vi.fn();

    // Real DuckDB tool
    const duckdbTool = createDuckDBTool(dbContext, null, undefined, mockChartDelete, mockMapStyleDelete);

    // Mock analysis tools
    const mockPredictorTool = tool({
        description: 'Mock predictor selection tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.predictor.push(args);
            return { predictors: [] };
        },
    });

    const mockRegressionTool = tool({
        description: 'Mock regression tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.regression.push(args);
            return { result: 'mocked' };
        },
    });

    const mockClusterTool = tool({
        description: 'Mock cluster tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.cluster.push(args);
            return { clusters: [] };
        },
    });

    const mockSegmentedRegressionTool = tool({
        description: 'Mock segmented regression tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.segmentedRegression.push(args);
            return { segments: [] };
        },
    });

    // Mock geocoding tools
    const mockGeocodeTool = tool({
        description: 'Mock geocode tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.geocode.push(args);
            return { lat: 0, lon: 0 };
        },
    });

    // Mock chart tools
    const mockChartUpdateTool = tool({
        description: 'Mock chart update tool',
        inputSchema: z.object({ tableName: z.string(), spec: z.object({}).passthrough() }),
        execute: async (args: { tableName: string; spec: unknown }) => {
            calls.chartUpdate.push(args);
            await mockChartUpdate(args.tableName, args.spec);
            return { success: true };
        },
    });

    const mockChartGetTool = tool({
        description: 'Mock chart get tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.chartGet.push(args);
            return { spec: null };
        },
    });

    const mockChartDeleteTool = tool({
        description: 'Mock chart delete tool',
        inputSchema: z.object({ tableName: z.string() }),
        execute: async (args: { tableName: string }) => {
            calls.chartDelete.push(args);
            await mockChartDelete(args.tableName);
            return { success: true };
        },
    });

    // Mock map style tools
    const mockMapStyleGetTool = tool({
        description: 'Mock map style get tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.mapStyleGet.push(args);
            return { style: null };
        },
    });

    const mockMapStyleUpdateTool = tool({
        description: 'Mock map style update tool',
        inputSchema: z.object({ tableName: z.string(), style: z.object({}).passthrough() }),
        execute: async (args: { tableName: string; style: unknown }) => {
            calls.mapStyleUpdate.push(args);
            await mockMapStyleUpdate(args.tableName, args.style);
            return { success: true };
        },
    });

    // Mock completion tool
    const mockCompletionTool = tool({
        description: 'Mock completion tool',
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
            calls.completion.push(args);
            return { completions: [] };
        },
    });

    // Assemble all tools
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any = {
        duckdb_query: duckdbTool,
        select_predictors_for_regression: mockPredictorTool,
        perform_regression_analysis: mockRegressionTool,
        perform_cluster_analysis: mockClusterTool,
        perform_segmented_regression_analysis: mockSegmentedRegressionTool,
        geocode_address: mockGeocodeTool,
        geocode_multiple_addresses: mockGeocodeTool,
        analyze_table_for_geocoding: mockGeocodeTool,
        add_geocoded_columns_to_table: mockGeocodeTool,
        update_vega_chart_spec_for_table: mockChartUpdateTool,
        get_vega_chart_spec_for_table: mockChartGetTool,
        delete_vega_chart_spec_for_table: mockChartDeleteTool,
        update_map_style_for_table: mockMapStyleUpdateTool,
        get_map_style_for_table: mockMapStyleGetTool,
        completion: mockCompletionTool,
    };

    return {
        tools,
        calls,
        mocks: {
            chartUpdate: mockChartUpdate,
            chartDelete: mockChartDelete,
            mapStyleUpdate: mockMapStyleUpdate,
            mapStyleDelete: mockMapStyleDelete,
        },
    };
}

// Re-export all tools from a single entry point
export { createDuckDBTool } from './duckdbTool';
export { createPredictorSelectionTool } from './predictorSelectionTool';
export { createRegressionTool } from './regressionTool';
export { createClusterTool } from './clusterTool';
export { createSegmentedRegressionTool } from './segmentedRegressionTool';
export { createGeocodingTools } from './geocodingTool';
export { createChartUpdateTool, createChartGetTool, createChartDeleteTool } from './chartTool';
export { createMapStyleTool } from './mapStyleTool';
export { createMapStyleGetTool } from './mapStyleGetTool';
export { completionTool } from './completionTool';

import type { DBContext } from '../../duckdb/dbContext';
import type { VegaChartSpec } from '../../../types/chart';
import type { ChatState } from '../../../store/remoteAtoms';
import type { TableStyle } from '../../../components/map';
import { createDuckDBTool } from './duckdbTool';
import { createPredictorSelectionTool } from './predictorSelectionTool';
import { createRegressionTool } from './regressionTool';
import { createClusterTool } from './clusterTool';
import { createSegmentedRegressionTool } from './segmentedRegressionTool';
import { createGeocodingTools } from './geocodingTool';
import { createChartUpdateTool, createChartGetTool, createChartDeleteTool } from './chartTool';
import { createMapStyleTool } from './mapStyleTool';
import { createMapStyleGetTool } from './mapStyleGetTool';
import { completionTool } from './completionTool';

// Define the type for all tools
export type Tools = {
    duckdb_query: ReturnType<typeof createDuckDBTool>;
    select_predictors_for_regression: ReturnType<typeof createPredictorSelectionTool>;
    perform_regression_analysis: ReturnType<typeof createRegressionTool>;
    perform_cluster_analysis: ReturnType<typeof createClusterTool>;
    perform_segmented_regression_analysis: ReturnType<typeof createSegmentedRegressionTool>;
    geocode_address: ReturnType<typeof createGeocodingTools>['geocode_address'];
    geocode_multiple_addresses: ReturnType<typeof createGeocodingTools>['geocode_multiple_addresses'];
    analyze_table_for_geocoding: ReturnType<typeof createGeocodingTools>['analyze_table_for_geocoding'];
    add_geocoded_columns_to_table: ReturnType<typeof createGeocodingTools>['add_geocoded_columns_to_table'];
    update_vega_chart_spec_for_table: ReturnType<typeof createChartUpdateTool>;
    get_vega_chart_spec_for_table: ReturnType<typeof createChartGetTool>;
    delete_vega_chart_spec_for_table: ReturnType<typeof createChartDeleteTool>;
    update_map_style_for_table: ReturnType<typeof createMapStyleTool>;
    get_map_style_for_table: ReturnType<typeof createMapStyleGetTool>;
    completion: typeof completionTool;
};

export interface ToolsOptions {
    dbContext: DBContext;
    schema: string | null;
    apiKey: string;
    onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
    onChartDelete?: (tableName: string) => Promise<void>;
    getCurrentChatState?: () => ChatState | null;
    onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>;
    onMapStyleDelete?: (tableName: string) => Promise<void>;
}

/**
 * Build tools object with actual implementations
 * Used for streaming AI responses
 */
export async function initTools(options: ToolsOptions): Promise<Tools> {
    // Create DuckDB tools
    const duckdb_query = createDuckDBTool(
        options.dbContext,
        options.schema,
        options.apiKey,
        options.onChartDelete,
        options.onMapStyleDelete
    );

    const select_predictors_for_regression = createPredictorSelectionTool(options.dbContext, options.schema);
    const perform_regression_analysis = createRegressionTool(options.dbContext, options.schema);
    const perform_cluster_analysis = createClusterTool(options.dbContext, options.schema);
    const perform_segmented_regression_analysis = createSegmentedRegressionTool(options.dbContext, options.schema);

    // Create geocoding tools
    const geocodingTools = createGeocodingTools(options.dbContext);

    // Create chart tools
    const update_vega_chart_spec_for_table = createChartUpdateTool(options.onChartUpdate, options.schema);
    const delete_vega_chart_spec_for_table = createChartDeleteTool(options.onChartDelete);
    const get_vega_chart_spec_for_table = createChartGetTool(options.getCurrentChatState);

    // Create map style tools
    const get_map_style_for_table = createMapStyleGetTool(
        tableName => options.getCurrentChatState?.()?.mapSpecs?.[tableName]
    );
    const update_map_style_for_table = createMapStyleTool(
        tableName => options.getCurrentChatState?.()?.mapSpecs?.[tableName],
        options.onMapStyleUpdate,
        options.dbContext,
        options.schema
    );

    return {
        duckdb_query,
        select_predictors_for_regression,
        perform_regression_analysis,
        perform_cluster_analysis,
        perform_segmented_regression_analysis,
        geocode_address: geocodingTools.geocode_address,
        geocode_multiple_addresses: geocodingTools.geocode_multiple_addresses,
        analyze_table_for_geocoding: geocodingTools.analyze_table_for_geocoding,
        add_geocoded_columns_to_table: geocodingTools.add_geocoded_columns_to_table,
        update_vega_chart_spec_for_table,
        get_vega_chart_spec_for_table,
        delete_vega_chart_spec_for_table,
        update_map_style_for_table,
        get_map_style_for_table,
        completion: completionTool,
    };
}

import type {
    LayerSpecification,
    FillLayerSpecification,
    LineLayerSpecification,
    CircleLayerSpecification,
    SymbolLayerSpecification,
    FillExtrusionLayerSpecification,
    HeatmapLayerSpecification,
    SourceSpecification,
    StyleSpecification,
} from 'maplibre-gl';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { MapStyleManager } from './mapStyleManager';

export interface ViewState {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
}

// Layer definition for vector tile sources (excludes source and source-layer as they're added dynamically)
export type VectorTileLayer = Omit<
    | FillLayerSpecification
    | LineLayerSpecification
    | CircleLayerSpecification
    | SymbolLayerSpecification
    | FillExtrusionLayerSpecification
    | HeatmapLayerSpecification,
    'source' | 'source-layer'
>;

// Array of layer style definitions for a table
export type TableStyle = VectorTileLayer[];

// Extra style can include any layer types including raster/hillshade
export type ExtraStyle = {
    sources?: Record<string, SourceSpecification>;
    layers?: LayerSpecification[];
};

export interface MapProps {
    dbContext: DBContext;
    schema?: string | null; // Current schema context
    selectedTable: string | null; // For backward compatibility and primary table
    tables?: string[]; // New prop for multiple tables: ["schema.table1", "table2", ...]
    selectedColumns?: string[];
    onMapReady?: (styleManager: MapStyleManager) => void;
    onStyleChange?: (styleChanger: (style: StyleSpecification) => void) => void;
    mapStyleManager?: MapStyleManager;
    geometryColumnName?: string;
    onViewStateChange?: (viewState: ViewState) => void;
    initialViewState?: ViewState;
    initialStyle?: StyleSpecification;
    onStyleUpdate?: (style: StyleSpecification) => void;
    tableStyles?: Record<string /*table name*/, TableStyle>;
    extraStyle?: ExtraStyle;
    onTableStyleChanged?: (tableName: string, style: TableStyle) => void;
    onExtraStyleChange?: (style: ExtraStyle) => void;
    showControls?: boolean; // Whether to show export and style editor controls (default: true)
    preserveDrawingBuffer?: boolean; // Enable canvas export (default: false, true for dashboards)
}

export type LayerType = 'point' | 'polygon' | 'line' | 'heatmap' | 'choropleth';

export interface VisualChannel {
  field?: string | null;
  scale?: 'linear' | 'quantile' | 'ordinal' | 'quantize';
  domain?: number[] | string[];
  range?: any[];
  accessor?: string;
}

export interface LayerConfig {
  id: string;
  type: LayerType;
  datasetId: string;
  visible: boolean;
  label: string;
  color?: string;
  
  // Visual channels for data-driven styling
  visualChannels?: {
    color?: VisualChannel;
    size?: VisualChannel;
    height?: VisualChannel;
    strokeColor?: VisualChannel;
    radius?: VisualChannel;
  };
  
  // Layer-specific config
  config?: {
    // Point layer
    radiusScale?: number;
    radiusFixed?: number;
    filled?: boolean;
    stroked?: boolean;
    lineWidthScale?: number;
    
    // Polygon/Choropleth layer
    opacity?: number;
    strokeWidth?: number;
    
    // Line layer
    lineWidth?: number;
    
    // Heatmap layer
    intensity?: number;
    threshold?: number;
    radiusPixels?: number;
  };
}

export interface LayerData {
  rows: any[];
  fields?: Array<{
    name: string;
    type: string;
  }>;
  bounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface RenderableLayer {
  id: string;
  type: string;
  source?: string | {
    type: 'geojson';
    data: any;
  };
  layout?: Record<string, any>;
  paint?: Record<string, any>;
  filter?: any[];
}
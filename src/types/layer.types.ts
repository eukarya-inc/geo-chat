// Layer type definitions following Kepler.gl patterns

export type LayerType = 'point' | 'arc' | 'line' | 'grid' | 'hexagon' | 'polygon' | 'geojson' | 'heatmap' | 'cluster';

export interface Field {
  name: string;
  type: 'integer' | 'real' | 'string' | 'boolean' | 'date' | 'timestamp' | 'geometry';
  format?: string;
  analyzerType?: string;
}

export interface VisualChannel {
  property: string;
  field: Field | null;
  scale: ScaleType;
  domain: Domain;
  range: ColorRange | SizeRange | number[];
  channelScaleType: ChannelScaleType;
  defaultValue?: any;
}

// Type guards for range types
export function isColorRange(range: any): range is ColorRange {
  return range && typeof range === 'object' && 'colors' in range;
}

export function isSizeRange(range: any): range is SizeRange {
  return range && typeof range === 'object' && 'min' in range && 'max' in range;
}

export type ScaleType = 'linear' | 'quantile' | 'quantize' | 'ordinal' | 'sqrt' | 'log';
export type ChannelScaleType = 'radius' | 'color' | 'size' | 'colorAggr' | 'sizeAggr';

export type Domain = [number, number] | string[];

export interface ColorRange {
  name: string;
  type: 'sequential' | 'diverging' | 'qualitative' | 'custom';
  category: 'Uber' | 'ColorBrewer' | 'Custom';
  colors: string[] | string[][];
  reversed?: boolean;
}

export interface SizeRange {
  min: number;
  max: number;
}

export interface LayerVisConfig {
  // Common vis config
  opacity: number;
  thickness?: number;
  strokeColor?: [number, number, number];
  
  // Point layer specific
  radius?: number;
  fixedRadius?: boolean;
  filled?: boolean;
  outline?: boolean;
  radiusRange?: [number, number];
  
  // Line layer specific
  targetColor?: [number, number, number];
  
  // Polygon layer specific
  wireframe?: boolean;
  
  // 3D specific
  enable3d?: boolean;
  elevationScale?: number;
  
  // Aggregation specific
  worldUnitSize?: number;
  coverage?: number;
  percentile?: [number, number];
  
  // Heatmap specific
  weight?: number;
  intensity?: number;
  
  // Allow additional properties for extensibility
  [key: string]: any;
}

export interface LayerColumns {
  geojson?: string;
  lat?: string;
  lng?: string;
  altitude?: string;
  
  // Arc layer
  lat0?: string;
  lng0?: string;
  lat1?: string;
  lng1?: string;
  
  // Hexagon/Grid
  hex_id?: string;
  
  // Allow any string key for flexibility
  [key: string]: string | undefined;
}

export interface LayerConfig {
  dataId: string;
  label: string;
  color: [number, number, number];
  columns: LayerColumns;
  isVisible: boolean;
  isConfigActive: boolean;
  highlightColor?: [number, number, number, number];
  hidden: boolean;
  visConfig: LayerVisConfig;
  textLabel?: TextLabel[];
}

export interface TextLabel {
  field: Field | null;
  color: [number, number, number];
  size: number;
  offset: [number, number];
  anchor: 'start' | 'middle' | 'end';
  alignment: 'center' | 'bottom' | 'top';
}

export interface Layer {
  id: string;
  type: LayerType;
  config: LayerConfig;
  visualChannels: {
    color?: VisualChannel;
    size?: VisualChannel;
    height?: VisualChannel;
    radius?: VisualChannel;
    coverage?: VisualChannel;
    strokeColor?: VisualChannel;
    [key: string]: VisualChannel | undefined;
  };
  
  // Animation
  animationConfig?: {
    enabled: boolean;
    domain?: [number, number];
    currentTime?: number;
    speed?: number;
  };
}

export interface Dataset {
  id: string;
  label: string;
  color: [number, number, number];
  allData: any[];
  fields: Field[];
  gpuFilter?: {
    filterRange: number[][];
    filterValueUpdateTriggers: any;
  };
}

// Scale utilities following Kepler.gl patterns
export interface ScaleUtils {
  getLinearScale(domain: [number, number], range: any[]): (value: number) => any;
  getQuantileScale(domain: number[], range: any[]): (value: number) => any;
  getOrdinalScale(domain: string[], range: any[]): (value: string) => any;
  getLogScale(domain: [number, number], range: any[]): (value: number) => any;
  getSqrtScale(domain: [number, number], range: any[]): (value: number) => any;
}
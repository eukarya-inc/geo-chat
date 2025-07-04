import { Layer as LayerType, LayerConfig, VisualChannel, Field, Dataset, isColorRange, isSizeRange } from '../../types/layer.types';
import { getScaleFunction } from '../../utils/colorScales';

export interface LayerProps {
  data: any[];
  gpuFilter?: any;
  objectHovered?: any;
  mapState?: any;
  interactionConfig?: any;
}

export interface LayerColumn {
  name: string;
  fieldIdx: number;
}

export interface VisualChannelDomain {
  [key: string]: [number, number] | string[];
}

// Base Layer class following Kepler.gl patterns
export abstract class Layer {
  id: string;
  type: string;
  config: LayerConfig;
  visualChannels: LayerType['visualChannels'];
  
  // Metadata
  name: string = 'Layer';
  requiredLayerColumns: string[] = [];
  optionalColumns: string[] = [];
  columnPairs?: { [key: string]: { pair: string[]; fieldPairKey: string } };
  
  // Visual channel definitions
  visConfigSettings: any = {};
  visualChannelDescriptions: any = {};
  
  constructor(props: Partial<LayerType> = {}) {
    this.id = props.id || '';
    this.type = props.type || '';
    this.config = props.config || {} as LayerConfig;
    this.visualChannels = props.visualChannels || {};
  }
  
  // Abstract methods that must be implemented by subclasses
  abstract formatLayerData(datasets: Dataset[], dataContainer: any): any;
  abstract getDefaultLayerConfig(props?: any): Partial<LayerConfig>;
  abstract renderLayer(props: LayerProps): any;
  abstract calculateDataAttribute(data: any, getValue: any): any;
  
  // Common methods
  getLayerColumns(): { [key: string]: LayerColumn | null } {
    const columns: { [key: string]: LayerColumn | null } = {};
    
    this.requiredLayerColumns.forEach(key => {
      columns[key] = this.config.columns[key] 
        ? { name: this.config.columns[key]!, fieldIdx: -1 }
        : null;
    });
    
    this.optionalColumns.forEach(key => {
      columns[key] = this.config.columns[key]
        ? { name: this.config.columns[key]!, fieldIdx: -1 }
        : null;
    });
    
    return columns;
  }
  
  // Visual channel methods
  updateLayerVisualChannel(dataset: Dataset, channel: string): void {
    const visualChannel = this.visualChannels[channel];
    if (!visualChannel || !visualChannel.field) return;
    
    // Calculate domain based on field
    const field = visualChannel.field;
    const allData = dataset.allData;
    const valueAccessor = (d: any) => d[field.name];
    
    let domain: any;
    if (field.type === 'real' || field.type === 'integer') {
      const values = allData.map(valueAccessor).filter(v => v !== null && v !== undefined);
      domain = [Math.min(...values), Math.max(...values)];
    } else {
      // For categorical data
      domain = Array.from(new Set(allData.map(valueAccessor)));
    }
    
    visualChannel.domain = domain;
  }
  
  getVisualChannelDescription(channel: string): any {
    return this.visualChannelDescriptions[channel];
  }
  
  // Data access methods
  getPositionAccessor(): (d: any) => [number, number] | null {
    return (d: any) => {
      if (this.config.columns.lat && this.config.columns.lng) {
        const lat = d[this.config.columns.lat];
        const lng = d[this.config.columns.lng];
        return lat !== null && lng !== null ? [lng, lat] : null;
      }
      return null;
    };
  }
  
  // Color accessor
  getColorAccessor(): (d: any) => [number, number, number] {
    const colorChannel = this.visualChannels.color;
    const defaultColor = this.config.color;
    
    if (!colorChannel || !colorChannel.field) {
      return () => defaultColor;
    }
    
    const { field, scale, domain, range } = colorChannel;
    const colors = isColorRange(range) ? range.colors : Array.isArray(range) ? range : [defaultColor];
    const scaleFunc = getScaleFunction(scale, domain, colors);
    
    return (d: any) => {
      const value = d[field.name];
      if (value === null || value === undefined) {
        return defaultColor;
      }
      
      const color = scaleFunc(value);
      if (Array.isArray(color) && color.length === 3) {
        return color as [number, number, number];
      }
      return defaultColor;
    };
  }
  
  // Size accessor
  getSizeAccessor(): (d: any) => number {
    const sizeChannel = this.visualChannels.size || this.visualChannels.radius;
    const defaultSize = this.config.visConfig.radius || 10;
    
    if (!sizeChannel || !sizeChannel.field) {
      return () => defaultSize;
    }
    
    const { field, scale, domain, range } = sizeChannel;
    const sizeRange = isSizeRange(range) ? [range.min, range.max] : Array.isArray(range) ? range : [0, defaultSize];
    const scaleFunc = getScaleFunction(scale, domain, sizeRange);
    
    return (d: any) => {
      const value = d[field.name];
      if (value === null || value === undefined) {
        return defaultSize;
      }
      
      const size = scaleFunc(value);
      return typeof size === 'number' ? size : defaultSize;
    };
  }
  
  // Height accessor (for 3D)
  getHeightAccessor(): (d: any) => number {
    const heightChannel = this.visualChannels.height;
    
    if (!heightChannel || !heightChannel.field || !this.config.visConfig.enable3d) {
      return () => 0;
    }
    
    const { field, scale, domain, range } = heightChannel;
    const heightRange = isSizeRange(range) ? [range.min, range.max] : Array.isArray(range) ? range : [0, 100];
    const scaleFunc = getScaleFunction(scale, domain, heightRange);
    
    return (d: any) => {
      const value = d[field.name];
      if (value === null || value === undefined) {
        return 0;
      }
      
      const height = scaleFunc(value);
      return typeof height === 'number' ? height : 0;
    };
  }
  
  // Filter data
  getFilteredData(allData: any[], gpuFilter?: any): any[] {
    if (!gpuFilter) return allData;
    
    // Apply GPU filter if available
    // This would integrate with the filter system
    return allData;
  }
  
  // Check if layer is valid
  isValid(): boolean {
    // Check required columns
    return this.requiredLayerColumns.every(col => 
      this.config.columns[col] !== undefined
    );
  }
  
  // Get hover info
  getHoverData(object: any, dataContainer: any): any {
    if (!object) return null;
    
    const data: any = {};
    
    // Add all fields
    Object.keys(object).forEach(key => {
      data[key] = object[key];
    });
    
    return data;
  }
  
  // Layer lifecycle
  shouldRenderLayer(oldProps: LayerProps, props: LayerProps): boolean {
    return true; // Override in subclasses for optimization
  }
  
  // MapLibre GL specific methods
  getMapLibreGLLayers(): any[] {
    // Override in subclasses to return MapLibre GL layer configs
    return [];
  }
  
  // Deck.gl specific methods (for future migration)
  getDeckGLLayers(): any[] {
    // Override in subclasses to return deck.gl layer configs
    return [];
  }
}
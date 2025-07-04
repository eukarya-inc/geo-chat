import { Layer, LayerProps } from './base/Layer';
import { Dataset, LayerConfig, isColorRange } from '../types/layer.types';

export default class PointLayer extends Layer {
  name = 'Point';
  requiredLayerColumns = ['lat', 'lng'];
  optionalColumns = ['altitude'];
  
  visConfigSettings = {
    radius: {
      type: 'number',
      defaultValue: 10,
      label: 'Point Radius',
      isRanged: false,
      range: [0, 100],
      step: 0.1,
    },
    fixedRadius: {
      type: 'boolean',
      defaultValue: false,
      label: 'Fixed Radius',
      description: 'Use fixed radius in meters',
    },
    opacity: {
      type: 'number',
      defaultValue: 0.8,
      label: 'Opacity',
      isRanged: false,
      range: [0, 1],
      step: 0.01,
    },
    outline: {
      type: 'boolean',
      defaultValue: false,
      label: 'Outline',
    },
    thickness: {
      type: 'number',
      defaultValue: 2,
      label: 'Outline Thickness',
      isRanged: false,
      range: [0, 10],
      step: 0.1,
      disabled: (props: any) => !props.outline,
    },
    strokeColor: {
      type: 'color-select',
      defaultValue: [255, 255, 255],
      label: 'Outline Color',
      disabled: (props: any) => !props.outline,
    },
    radiusRange: {
      type: 'number-range',
      defaultValue: [0, 50],
      label: 'Radius Range',
      isRanged: true,
      range: [0, 500],
      step: 0.1,
    },
    filled: {
      type: 'boolean',
      defaultValue: true,
      label: 'Fill',
    },
  };
  
  visualChannelDescriptions = {
    color: {
      label: 'Fill Color',
      measure: 'Fill Color',
    },
    size: {
      label: 'Radius',
      measure: 'Radius',
    },
    strokeColor: {
      label: 'Outline Color',
      measure: 'Outline Color',
    },
  };
  
  getDefaultLayerConfig(props?: any): Partial<LayerConfig> {
    return {
      dataId: props?.dataId || '',
      label: 'Point Layer',
      color: [255, 153, 31],
      columns: {},
      isVisible: true,
      isConfigActive: true,
      hidden: false,
      visConfig: {
        radius: 10,
        fixedRadius: false,
        opacity: 0.8,
        outline: false,
        thickness: 2,
        strokeColor: [255, 255, 255],
        radiusRange: [0, 50],
        filled: true,
      },
    };
  }
  
  formatLayerData(datasets: Dataset[], dataContainer: any): any {
    const { dataId } = this.config;
    const dataset = datasets.find(d => d.id === dataId);
    
    if (!dataset) return { data: [] };
    
    const { allData } = dataset;
    const { lat, lng, altitude } = this.config.columns;
    
    // Filter valid points
    const data = allData.filter(d => {
      const latValue = lat ? d[lat] : null;
      const lngValue = lng ? d[lng] : null;
      
      return (
        latValue !== null && 
        latValue !== undefined &&
        lngValue !== null &&
        lngValue !== undefined &&
        Math.abs(latValue) <= 90 &&
        Math.abs(lngValue) <= 180
      );
    });
    
    return { data };
  }
  
  calculateDataAttribute(data: any, getValue: any): any {
    // Calculate attributes for GPU aggregation
    return data.map((d: any) => getValue(d));
  }
  
  renderLayer(props: LayerProps): any {
    const { data } = props;
    
    // This would return deck.gl layers in the future
    // For now, return MapLibre GL layer config
    return this.getMapLibreGLLayers();
  }
  
  getMapLibreGLLayers(): any[] {
    const layers: any[] = [];
    const { lat, lng } = this.config.columns;
    
    if (!lat || !lng) return layers;
    
    const {
      radius,
      fixedRadius,
      opacity,
      outline,
      thickness,
      strokeColor,
      filled,
    } = this.config.visConfig;
    
    // Create GeoJSON source data
    const sourceId = `${this.id}-source`;
    const layerId = `${this.id}-points`;
    const outlineLayerId = `${this.id}-points-outline`;
    
    // Point layer
    if (filled) {
      layers.push({
        id: layerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': this.getRadiusPaintProperty(),
          'circle-color': this.getColorPaintProperty(),
          'circle-opacity': opacity,
          'circle-stroke-width': 0,
        },
      });
    }
    
    // Outline layer
    if (outline) {
      layers.push({
        id: outlineLayerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': this.getRadiusPaintProperty(),
          'circle-color': 'transparent',
          'circle-opacity': 1,
          'circle-stroke-width': thickness,
          'circle-stroke-color': this.getStrokeColorPaintProperty(),
          'circle-stroke-opacity': opacity,
        },
      });
    }
    
    return layers;
  }
  
  getRadiusPaintProperty(): any {
    const { radius, fixedRadius, radiusRange = [0, 50] } = this.config.visConfig;
    const sizeChannel = this.visualChannels.size || this.visualChannels.radius;
    
    if (!sizeChannel || !sizeChannel.field) {
      // Fixed radius
      if (fixedRadius) {
        // Convert meters to pixels based on zoom
        return {
          'stops': [
            [0, 0],
            [20, radius],
          ],
        };
      }
      return radius;
    }
    
    // Data-driven radius
    const { field, domain, scale } = sizeChannel;
    
    if (scale === 'linear') {
      return {
        'property': field.name,
        'type': 'interval',
        'stops': [
          [domain[0], radiusRange[0]],
          [domain[1], radiusRange[1]],
        ],
      };
    } else if (scale === 'quantile') {
      // Create quantile stops
      const stops = this.createQuantileStops(domain, radiusRange);
      return {
        'property': field.name,
        'type': 'interval',
        'stops': stops,
      };
    }
    
    return radius;
  }
  
  getColorPaintProperty(): any {
    const colorChannel = this.visualChannels.color;
    const defaultColor = `rgb(${this.config.color.join(',')})`;
    
    if (!colorChannel || !colorChannel.field) {
      return defaultColor;
    }
    
    const { field, domain, range, scale } = colorChannel;
    
    if (scale === 'ordinal') {
      // Categorical colors
      const colors = isColorRange(range) ? range.colors : [];
      const stops = (domain as string[]).map((value, i) => {
        const color = colors[i % colors.length] || this.config.color;
        const colorStr = Array.isArray(color) ? `rgb(${color.join(',')})` : color;
        return [value, colorStr];
      });
      
      return {
        'property': field.name,
        'type': 'categorical',
        'stops': stops,
        'default': defaultColor,
      };
    } else {
      // Continuous colors
      const colors = isColorRange(range) ? range.colors : [];
      const numDomain = domain as [number, number];
      const stops = colors.map((color: any, i: number) => {
        const value = numDomain[0] + (numDomain[1] - numDomain[0]) * (i / (colors.length - 1));
        const colorStr = Array.isArray(color) ? `rgb(${color.join(',')})` : color;
        return [value, colorStr];
      });
      
      return {
        'property': field.name,
        'type': 'interval',
        'stops': stops,
      };
    }
  }
  
  getStrokeColorPaintProperty(): any {
    const strokeColorChannel = this.visualChannels.strokeColor;
    const strokeColor = this.config.visConfig.strokeColor || [255, 255, 255];
    const defaultColor = `rgb(${strokeColor.join(',')})`;
    
    if (!strokeColorChannel || !strokeColorChannel.field) {
      return defaultColor;
    }
    
    // Similar to getColorPaintProperty but for stroke
    return this.getColorPaintProperty();
  }
  
  createQuantileStops(domain: any[], range: [number, number]): any[] {
    const sortedDomain = [...domain].sort((a, b) => a - b);
    const numStops = 5; // Create 5 quantile stops
    const stops = [];
    
    for (let i = 0; i < numStops; i++) {
      const quantileIndex = Math.floor((i / numStops) * sortedDomain.length);
      const value = sortedDomain[quantileIndex];
      const size = range[0] + (range[1] - range[0]) * (i / (numStops - 1));
      stops.push([value, size]);
    }
    
    return stops;
  }
}
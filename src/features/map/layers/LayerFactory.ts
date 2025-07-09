import { BaseLayer } from './BaseLayer';
import { PointLayer } from './PointLayer';
import { PolygonLayer } from './PolygonLayer';
import { LineLayer } from './LineLayer';
import type { LayerConfig, LayerType } from '../types/layer';

export class LayerFactory {
  static createLayer(config: LayerConfig): BaseLayer {
    switch (config.type) {
      case 'point':
        return new PointLayer(config);
      case 'polygon':
        return new PolygonLayer(config);
      case 'line':
        return new LineLayer(config);
      case 'choropleth':
        // For now, choropleth uses the same implementation as polygon
        return new PolygonLayer(config);
      case 'heatmap':
        // TODO: Implement HeatmapLayer
        throw new Error('Heatmap layer not yet implemented');
      default:
        throw new Error(`Unknown layer type: ${config.type}`);
    }
  }
  
  static getLayerTypeFromGeometry(geometryType: string): LayerType | null {
    switch (geometryType.toLowerCase()) {
      case 'point':
      case 'multipoint':
        return 'point';
      case 'polygon':
      case 'multipolygon':
        return 'polygon';
      case 'linestring':
      case 'multilinestring':
        return 'line';
      default:
        return null;
    }
  }
}
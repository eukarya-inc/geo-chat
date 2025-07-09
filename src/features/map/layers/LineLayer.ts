import { BaseLayer } from './BaseLayer';
import type { LayerData, RenderableLayer } from '../types/layer';

export class LineLayer extends BaseLayer {
  formatLayerData(data: any[], fields: any[]): LayerData {
    const features: any[] = [];
    const geometries: any[] = [];

    data.forEach((row, index) => {
      // Look for geometry column
      const geomColumn = fields.find(f => 
        f.name.toLowerCase() === 'geometry' || 
        f.name.toLowerCase() === 'geom' ||
        f.type === 'GEOMETRY'
      );

      if (geomColumn && row[geomColumn.name]) {
        const geometry = row[geomColumn.name];
        
        if (geometry && (geometry.type === 'LineString' || geometry.type === 'MultiLineString')) {
          geometries.push(geometry);
          features.push({
            type: 'Feature',
            id: index,
            geometry,
            properties: row
          });
        }
      }
    });

    const bounds = geometries.length > 0 ? this.calculateBounds(geometries) : undefined;

    return {
      rows: features,
      fields,
      bounds
    };
  }

  renderLayer(): RenderableLayer[] {
    if (!this.data || this.data.rows.length === 0) {
      return [];
    }

    const layerConfig = this.config.config || {};
    const lineWidth = layerConfig.lineWidth || 2;

    const layers: RenderableLayer[] = [];

    // Create GeoJSON source data
    const sourceData = {
      type: 'FeatureCollection',
      features: this.data.rows
    };

    // Line layer
    layers.push({
      id: `${this.id}-line`,
      type: 'line',
      source: {
        type: 'geojson',
        data: sourceData
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': this.getColor('#4f46e5'),
        'line-width': lineWidth,
        'line-opacity': 0.8
      }
    });

    return layers;
  }
}
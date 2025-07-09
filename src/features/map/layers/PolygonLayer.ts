import { BaseLayer } from './BaseLayer';
import type { LayerData, RenderableLayer } from '../types/layer';

export class PolygonLayer extends BaseLayer {
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
        
        if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
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
    const opacity = layerConfig.opacity || 0.8;
    const strokeWidth = layerConfig.strokeWidth || 1;

    const layers: RenderableLayer[] = [];

    // Create GeoJSON source data
    const sourceData = {
      type: 'FeatureCollection',
      features: this.data.rows
    };

    // Fill layer
    layers.push({
      id: `${this.id}-fill`,
      type: 'fill',
      source: {
        type: 'geojson',
        data: sourceData
      },
      paint: {
        'fill-color': this.getColor('#4f46e5'),
        'fill-opacity': opacity
      }
    });

    // Outline layer
    if (strokeWidth > 0) {
      layers.push({
        id: `${this.id}-outline`,
        type: 'line',
        source: {
          type: 'geojson',
          data: sourceData
        },
        paint: {
          'line-color': this.config.visualChannels?.strokeColor?.field
            ? ['get', this.config.visualChannels.strokeColor.field]
            : '#000000',
          'line-width': strokeWidth,
          'line-opacity': 1
        }
      });
    }

    return layers;
  }
}
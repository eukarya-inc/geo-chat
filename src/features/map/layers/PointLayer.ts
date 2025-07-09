import { BaseLayer } from './BaseLayer';
import type { LayerData, RenderableLayer } from '../types/layer';

export class PointLayer extends BaseLayer {
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

      let geometry = null;
      
      if (geomColumn && row[geomColumn.name]) {
        // If we have a geometry column, use it
        geometry = row[geomColumn.name];
      } else {
        // Look for lat/lng columns
        const latColumn = fields.find(f => 
          f.name.toLowerCase().includes('lat') || 
          f.name.toLowerCase() === 'y'
        );
        const lngColumn = fields.find(f => 
          f.name.toLowerCase().includes('lon') || 
          f.name.toLowerCase().includes('lng') || 
          f.name.toLowerCase() === 'x'
        );

        if (latColumn && lngColumn && row[latColumn.name] && row[lngColumn.name]) {
          geometry = {
            type: 'Point',
            coordinates: [
              parseFloat(row[lngColumn.name]),
              parseFloat(row[latColumn.name])
            ]
          };
        }
      }

      if (geometry && geometry.type === 'Point') {
        geometries.push(geometry);
        features.push({
          type: 'Feature',
          id: index,
          geometry,
          properties: row
        });
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
    const filled = layerConfig.filled !== false;
    const stroked = layerConfig.stroked !== false;

    const layers: RenderableLayer[] = [];

    // Create GeoJSON source data
    const sourceData = {
      type: 'FeatureCollection',
      features: this.data.rows
    };

    // Filled circles layer
    if (filled) {
      layers.push({
        id: `${this.id}-circle`,
        type: 'circle',
        source: {
          type: 'geojson',
          data: sourceData
        },
        paint: {
          'circle-radius': this.getSize(layerConfig.radiusFixed || 5),
          'circle-color': this.getColor(),
          'circle-opacity': 0.8,
          'circle-stroke-width': stroked ? (layerConfig.lineWidthScale || 1) : 0,
          'circle-stroke-color': this.config.visualChannels?.strokeColor?.field
            ? ['get', this.config.visualChannels.strokeColor.field]
            : '#ffffff',
          'circle-stroke-opacity': stroked ? 1 : 0
        }
      });
    }

    return layers;
  }
}
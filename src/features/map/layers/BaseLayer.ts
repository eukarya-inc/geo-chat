import type { LayerConfig, LayerData, LayerType, RenderableLayer } from '../types/layer';

export abstract class BaseLayer {
  id: string;
  type: LayerType;
  config: LayerConfig;
  data: LayerData | null = null;

  constructor(config: LayerConfig) {
    this.id = config.id;
    this.type = config.type;
    this.config = config;
  }

  abstract formatLayerData(data: any[], fields: any[]): LayerData;
  abstract renderLayer(): RenderableLayer | RenderableLayer[];

  updateLayerConfig(updates: Partial<LayerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  updateLayerData(data: any[], fields: any[]): void {
    this.data = this.formatLayerData(data, fields);
  }

  isVisible(): boolean {
    return this.config.visible;
  }

  toggleVisibility(): void {
    this.config.visible = !this.config.visible;
  }

  /**
   * Get the bounds of the layer data
   */
  getBounds(): [number, number, number, number] | null {
    return this.data?.bounds || null;
  }

  /**
   * Get color based on visual channel configuration
   */
  protected getColor(defaultColor: string = '#4f46e5'): string | any {
    const colorChannel = this.config.visualChannels?.color;
    if (!colorChannel?.field) {
      return this.config.color || defaultColor;
    }
    
    // For data-driven styling, return MapLibre expression
    return [
      'case',
      ['has', colorChannel.field],
      ['get', colorChannel.field],
      defaultColor
    ];
  }

  /**
   * Get size based on visual channel configuration
   */
  protected getSize(defaultSize: number = 5): number | any {
    const sizeChannel = this.config.visualChannels?.size;
    if (!sizeChannel?.field) {
      return this.config.config?.radiusFixed || defaultSize;
    }
    
    // For data-driven styling, return MapLibre expression
    const domain = sizeChannel.domain || [0, 100];
    const range = sizeChannel.range || [2, 20];
    
    return [
      'interpolate',
      ['linear'],
      ['get', sizeChannel.field],
      domain[0], range[0],
      domain[1], range[1]
    ];
  }

  /**
   * Calculate bounds from geometry data
   */
  protected calculateBounds(geometries: any[]): [number, number, number, number] {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    geometries.forEach(geom => {
      if (geom.type === 'Point') {
        const [lng, lat] = geom.coordinates;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        const coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        coords.forEach((polygon: any) => {
          polygon[0].forEach(([lng, lat]: [number, number]) => {
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
          });
        });
      } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
        const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
        coords.forEach((line: any) => {
          line.forEach(([lng, lat]: [number, number]) => {
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
          });
        });
      }
    });

    return [minLng, minLat, maxLng, maxLat];
  }
}
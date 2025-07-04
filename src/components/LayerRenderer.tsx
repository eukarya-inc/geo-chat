import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppSelector } from '../store/hooks';
import { Layer } from '../layers/base/Layer';
import PointLayer from '../layers/PointLayer';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';

interface LayerRendererProps {
  map: maplibregl.Map | null;
  db: AsyncDuckDB;
}

export function LayerRenderer({ map, db }: LayerRendererProps) {
  const { layers, layerOrder, datasets } = useAppSelector(state => state.layers);
  const layerInstancesRef = useRef<Map<string, Layer>>(new Map());

  useEffect(() => {
    if (!map || !db) return;

    // Create layer instances
    const newInstances = new Map<string, Layer>();
    
    layers.forEach(layerConfig => {
      const dataset = datasets.find(d => d.id === layerConfig.config.dataId);
      if (!dataset) return;

      let instance: Layer | null = null;
      
      switch (layerConfig.type) {
        case 'point':
          instance = new PointLayer(layerConfig);
          break;
        // Add other layer types here as they're implemented
        default:
          console.warn(`Unsupported layer type: ${layerConfig.type}`);
      }

      if (instance) {
        newInstances.set(layerConfig.id, instance);
      }
    });

    // Remove old layers that no longer exist
    layerInstancesRef.current.forEach((instance, id) => {
      if (!newInstances.has(id)) {
        // Remove MapLibre layers
        const dataset = datasets.find(d => d.id === instance.config.dataId);
        const mapLayers = instance.renderLayer({ data: dataset?.allData || [] });
        mapLayers.forEach((layer: any) => {
          if (map.getLayer(layer.id)) {
            map.removeLayer(layer.id);
          }
        });
        
        // Remove source if it exists
        const sourceId = `layer-${id}`;
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      }
    });

    // Add/update layers
    newInstances.forEach((instance, id) => {
      const oldInstance = layerInstancesRef.current.get(id);
      const dataset = datasets.find(d => d.id === instance.config.dataId);
      const mapLayers = instance.renderLayer({ data: dataset?.allData || [] });
      const sourceId = `layer-${id}`;

      // Check if we need to update the source
      const needsSourceUpdate = !oldInstance || 
        oldInstance.config.dataId !== instance.config.dataId ||
        oldInstance.type !== instance.type;

      if (needsSourceUpdate) {
        // Remove old source if it exists
        if (map.getSource(sourceId)) {
          // Remove all layers using this source first
          mapLayers.forEach((layer: any) => {
            if (map.getLayer(layer.id)) {
              map.removeLayer(layer.id);
            }
          });
          map.removeSource(sourceId);
        }

        // Add new source with data
        const dataset = datasets.find(d => d.id === instance.config.dataId);
        if (dataset && dataset.allData.length > 0) {
          // Convert data to GeoJSON based on layer type
          const features = dataset.allData.map((row, idx) => {
            // For now, assume we have lat/lng columns
            // This should be made more sophisticated based on detected geometry columns
            const lat = row.latitude || row.lat || row.y;
            const lng = row.longitude || row.lng || row.lon || row.x;
            
            if (lat == null || lng == null) return null;

            return {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [lng, lat]
              },
              properties: row
            };
          }).filter(f => f !== null);

          const geojson = {
            type: 'FeatureCollection' as const,
            features
          };

          map.addSource(sourceId, {
            type: 'geojson',
            data: geojson
          });
        }
      }

      // Add/update layers
      mapLayers.forEach((layerConfig: any, index: number) => {
        const existingLayer = map.getLayer(layerConfig.id);
        
        if (!existingLayer) {
          // Add new layer
          const beforeId = index > 0 ? mapLayers[index - 1].id : undefined;
          map.addLayer({
            ...layerConfig,
            source: sourceId
          }, beforeId);
        } else {
          // Update existing layer properties
          if (layerConfig.paint) {
            Object.entries(layerConfig.paint).forEach(([prop, value]) => {
              map.setPaintProperty(layerConfig.id, prop, value);
            });
          }
          if (layerConfig.layout) {
            Object.entries(layerConfig.layout).forEach(([prop, value]) => {
              map.setLayoutProperty(layerConfig.id, prop, value);
            });
          }
        }

        // Update visibility
        map.setLayoutProperty(
          layerConfig.id, 
          'visibility', 
          instance.config.isVisible ? 'visible' : 'none'
        );
      });
    });

    // Update layer order
    const orderedLayerIds = layerOrder.flatMap(layerId => {
      const instance = newInstances.get(layerId);
      if (!instance) return [];
      const dataset = datasets.find(d => d.id === instance.config.dataId);
      return instance.renderLayer({ data: dataset?.allData || [] }).map((l: any) => l.id);
    });

    // Reorder layers
    for (let i = 1; i < orderedLayerIds.length; i++) {
      const layerId = orderedLayerIds[i];
      const beforeId = orderedLayerIds[i - 1];
      
      if (map.getLayer(layerId) && map.getLayer(beforeId)) {
        map.moveLayer(layerId, beforeId);
      }
    }

    layerInstancesRef.current = newInstances;
  }, [map, db, layers, layerOrder, datasets]);

  return null;
}
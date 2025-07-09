import { useCallback, useRef, useState, useEffect } from 'react';
import MapGL, { NavigationControl, ScaleControl, AttributionControl, Layer, Source } from 'react-map-gl/maplibre';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { updateViewport, setMapLoaded } from '@/store/slices/mapSlice';
import { LayerFactory } from '@/features/map/layers';
import { loadDataForLayer } from '@/features/map/utils/dataLoader';
import type { MapRef } from 'react-map-gl/maplibre';
import type { BaseLayer } from '@/features/map/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';

interface MapViewProps {
  height?: string | number;
  width?: string | number;
}

const DEFAULT_VIEWPORT = {
  longitude: 0,
  latitude: 0,
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

export function MapView({ height = '100%', width = '100%' }: MapViewProps) {
  const dispatch = useAppDispatch();
  const viewport = useAppSelector((state) => state.map.viewport);
  const mapStyle = useAppSelector((state) => state.map.mapStyle);
  const mapLayers = useAppSelector((state) => state.map.layers);
  const datasets = useAppSelector((state) => state.data.datasets);
  
  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [layerInstances, setLayerInstances] = useState<Map<string, BaseLayer>>(new Map());

  // Process layers when map layers or datasets change
  useEffect(() => {
    const loadLayers = async () => {
      console.log(`🗺️ MapView: Loading ${mapLayers.length} layers`);
      const newLayerInstances = new Map();
      
      for (const layerConfig of mapLayers) {
        try {
          console.log(`  - Processing layer ${layerConfig.id} (type: ${layerConfig.type})`);
          
          // Find the dataset for this layer
          const dataset = datasets.find(d => d.id === layerConfig.sourceId);
          if (!dataset) {
            console.log(`    ❌ Dataset not found for source ID: ${layerConfig.sourceId}`);
            continue;
          }
          console.log(`    ✓ Found dataset: ${dataset.name}`);
          
          // Load data from DuckDB
          const dataResult = await loadDataForLayer(layerConfig.sourceId);
          if (!dataResult) {
            console.log(`    ❌ Failed to load data from DuckDB`);
            continue;
          }
          console.log(`    ✓ Loaded ${dataResult.data.length} features`);
          
          // Create or update layer instance
          let layer = layerInstances.get(layerConfig.id);
          if (!layer || layer.type !== layerConfig.type) {
            layer = LayerFactory.createLayer({
              id: layerConfig.id,
              type: layerConfig.type,
              datasetId: layerConfig.sourceId,
              visible: layerConfig.visible,
              label: dataset.name,
              ...layerConfig.style
            });
          }
          
          // Update layer data
          layer.updateLayerData(dataResult.data, dataResult.columns);
          layer.updateLayerConfig({ visible: layerConfig.visible });
          
          newLayerInstances.set(layerConfig.id, layer);
        } catch (error) {
          console.error(`Error creating layer ${layerConfig.id}:`, error);
        }
      }
      
      setLayerInstances(newLayerInstances);
      
      // Auto-zoom to bounds when first layer is added
      if (newLayerInstances.size > 0 && layerInstances.size === 0) {
        const allBounds: number[][] = [];
        
        newLayerInstances.forEach(layer => {
          const bounds = layer.getBounds();
          if (bounds) {
            allBounds.push([bounds[0], bounds[1]]); // SW corner
            allBounds.push([bounds[2], bounds[3]]); // NE corner
          }
        });
        
        if (allBounds.length > 0 && mapRef.current) {
          const map = mapRef.current.getMap();
          
          // Calculate combined bounds
          const minLng = Math.min(...allBounds.map(b => b[0]));
          const minLat = Math.min(...allBounds.map(b => b[1]));
          const maxLng = Math.max(...allBounds.map(b => b[0]));
          const maxLat = Math.max(...allBounds.map(b => b[1]));
          
          // Fit to bounds with padding
          map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 50, duration: 1000 }
          );
          
          console.log(`🗺️ Auto-zooming to layer bounds: [${minLng}, ${minLat}, ${maxLng}, ${maxLat}]`);
        }
      }
    };
    
    loadLayers();
  }, [mapLayers, datasets, layerInstances.size]);

  const handleViewportChange = useCallback((viewState: any) => {
    dispatch(updateViewport({
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      pitch: viewState.pitch || 0,
      bearing: viewState.bearing || 0,
    }));
  }, [dispatch]);

  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
    dispatch(setMapLoaded(true));
    console.log('🗺️ Map: MapLibre GL loaded');
  }, [dispatch]);

  return (
    <div className="map-container" style={{ height, width }}>
      <MapGL
        ref={mapRef}
        {...(viewport || DEFAULT_VIEWPORT)}
        onMove={(evt) => handleViewportChange(evt.viewState)}
        onLoad={handleMapLoad}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {/* Navigation Controls */}
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-right" />
        <AttributionControl 
          position="bottom-left" 
          customAttribution="© OpenStreetMap contributors"
        />

        {/* Render layers using our layer system */}
        {isMapLoaded && Array.from(layerInstances.values()).map((layer) => {
          if (!layer.isVisible()) return null;
          
          const renderableLayers = layer.renderLayer();
          if (!Array.isArray(renderableLayers)) {
            return null;
          }
          
          return renderableLayers.map((renderableLayer) => {
            const { source, ...layerProps } = renderableLayer as any;
            
            return (
              <Source
                key={`${layer.id}-source`}
                id={`${layer.id}-source`}
                type={source.type}
                data={source.data}
              >
                <Layer
                  key={renderableLayer.id}
                  {...layerProps}
                  source={`${layer.id}-source`}
                />
              </Source>
            );
          });
        })}
      </MapGL>

      {/* Map status indicator */}
      {!isMapLoaded && (
        <div className="map-loading">
          <div className="map-loading-spinner"></div>
          <span>Loading map...</span>
        </div>
      )}
    </div>
  );
}
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { MapStyleManager } from '../utils/mapStyleManager';

interface MapProps {
  db: AsyncDuckDB;
  selectedTable: string | null;
  selectedColumns: string[];
  onMapReady?: (styleManager: MapStyleManager) => void;
  mapStyleManager?: MapStyleManager;
}

const Map: React.FC<MapProps> = ({ 
  db, 
  selectedTable, 
  selectedColumns, 
  onMapReady
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [0, 0],
      zoom: 2
    });

    map.current.on('load', () => {
      setIsMapLoaded(true);
      if (onMapReady && map.current) {
        // Import and create proper style manager
        import('../utils/mapStyleManager').then(({ MapStyleManager }) => {
          const styleManager = new MapStyleManager(map.current!);
          onMapReady(styleManager);
        });
      }
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [onMapReady]);

  // Load data from selected table
  useEffect(() => {
    if (!db || !selectedTable || !isMapLoaded || !map.current) return;

    const loadTableData = async () => {
      const conn = await db.connect();
      
      try {
        // Check if spatial extension is loaded
        await conn.query("LOAD spatial");

        // Query to check if table has geometry column
        const geomCheckQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${selectedTable}' 
          AND (data_type = 'GEOMETRY' OR column_name = 'geom')
        `;
        
        const geomResult = await conn.query(geomCheckQuery);
        const geomColumns = geomResult.toArray();
        
        if (geomColumns.length === 0) {
          console.log('No geometry column found in table:', selectedTable);
          return;
        }

        const geomColumn = geomColumns[0].column_name;

        // Get table data as GeoJSON
        const query = `
          SELECT 
            ST_AsGeoJSON(${geomColumn}) as geometry,
            ${selectedColumns.length > 0 ? selectedColumns.join(', ') : '*'}
          FROM ${selectedTable}
          WHERE ${geomColumn} IS NOT NULL
          LIMIT 10000
        `;

        const result = await conn.query(query);
        const data = result.toArray();

        if (data.length === 0) {
          console.log('No data found in table:', selectedTable);
          return;
        }

        // Convert to GeoJSON FeatureCollection
        const features = data.map((row: Record<string, unknown>, index: number) => {
          const { geometry, ...properties } = row;
          
          // Remove the geometry column from properties if it exists
          delete properties[geomColumn];
          
          return {
            type: 'Feature' as const,
            id: index,
            geometry: JSON.parse(geometry as string),
            properties
          } as GeoJSON.Feature;
        });

        const featureCollection: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection' as const,
          features
        };

        // Remove existing layer and source if they exist
        if (map.current?.getLayer('data-layer')) {
          map.current.removeLayer('data-layer');
        }
        if (map.current?.getLayer('data-layer-outline')) {
          map.current.removeLayer('data-layer-outline');
        }
        if (map.current?.getSource('data-source')) {
          map.current.removeSource('data-source');
        }

        // Add new source
        map.current?.addSource('data-source', {
          type: 'geojson',
          data: featureCollection
        });

        // Determine geometry type from first feature
        const firstGeometry = features[0]?.geometry;
        if (!firstGeometry) return;

        // Add appropriate layers based on geometry type
        if (firstGeometry.type === 'Point' || firstGeometry.type === 'MultiPoint') {
          map.current?.addLayer({
            id: 'data-layer',
            type: 'circle',
            source: 'data-source',
            paint: {
              'circle-radius': 6,
              'circle-color': '#007cbf',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2
            }
          });
        } else if (firstGeometry.type === 'LineString' || firstGeometry.type === 'MultiLineString') {
          map.current?.addLayer({
            id: 'data-layer',
            type: 'line',
            source: 'data-source',
            paint: {
              'line-color': '#007cbf',
              'line-width': 3
            }
          });
        } else if (firstGeometry.type === 'Polygon' || firstGeometry.type === 'MultiPolygon') {
          // Add fill layer
          map.current?.addLayer({
            id: 'data-layer',
            type: 'fill',
            source: 'data-source',
            paint: {
              'fill-color': '#007cbf',
              'fill-opacity': 0.5
            }
          });

          // Add outline layer
          map.current?.addLayer({
            id: 'data-layer-outline',
            type: 'line',
            source: 'data-source',
            paint: {
              'line-color': '#0056b3',
              'line-width': 2
            }
          });
        }

        // Fit map to data bounds
        const bounds = new maplibregl.LngLatBounds();
        features.forEach(feature => {
          if (feature.geometry.type === 'Point') {
            bounds.extend(feature.geometry.coordinates as [number, number]);
          } else if (feature.geometry.type === 'Polygon') {
            (feature.geometry.coordinates[0] as Array<[number, number]>).forEach(coord => {
              bounds.extend(coord);
            });
          }
          // Add other geometry types as needed
        });

        if (!bounds.isEmpty()) {
          map.current?.fitBounds(bounds, { padding: 50 });
        }

        // Add popup interaction
        const layers = ['data-layer'];
        if (map.current?.getLayer('data-layer-outline')) {
          layers.push('data-layer-outline');
        }

        // Change cursor on hover
        layers.forEach(layer => {
          map.current?.on('mouseenter', layer, () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });

          map.current?.on('mouseleave', layer, () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });

          // Show popup on click
          map.current?.on('click', layer, (e) => {
            if (!e.features || e.features.length === 0) return;

            const feature = e.features[0];
            const coordinates = e.lngLat;
            const properties = feature.properties;

            // Create popup content
            let popupContent = '<div style="padding: 10px;">';
            
            if (selectedColumns.length > 0) {
              selectedColumns.forEach(col => {
                if (properties && col in properties) {
                  popupContent += `<p><strong>${col}:</strong> ${properties[col]}</p>`;
                }
              });
            } else {
              // Show all properties
              for (const [key, value] of Object.entries(properties || {})) {
                popupContent += `<p><strong>${key}:</strong> ${value}</p>`;
              }
            }
            
            popupContent += '</div>';

            if (map.current) {
              new maplibregl.Popup()
                .setLngLat(coordinates)
                .setHTML(popupContent)
                .addTo(map.current);
            }
          });
        });

      } catch (error) {
        console.error('Error loading table data:', error);
      } finally {
        await conn.close();
      }
    };

    loadTableData();
  }, [db, selectedTable, selectedColumns, isMapLoaded]);

  return (
    <div 
      ref={mapContainer} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative'
      }} 
    />
  );
};

export default Map;
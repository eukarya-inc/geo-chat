import { Dataset } from '@/store/slices/dataSlice';
import { MapLayer } from '@/store/slices/mapSlice';
import { LayerType } from '../types/layer';

interface FieldPair {
  lat: string;
  lng: string;
}

/**
 * Find latitude/longitude field pairs in the dataset
 */
function findLatLngFieldPairs(columns: Dataset['columns']): FieldPair[] {
  const pairs: FieldPair[] = [];
  
  // Common latitude patterns
  const latPatterns = [/^lat$/i, /latitude/i, /^y$/i];
  // Common longitude patterns  
  const lngPatterns = [/^lng$/i, /^lon$/i, /longitude/i, /^x$/i];
  
  // Find potential lat columns
  const latColumns = columns.filter(col => 
    !col.isGeometry && 
    (col.type.includes('DOUBLE') || col.type.includes('FLOAT') || col.type.includes('DECIMAL')) &&
    latPatterns.some(pattern => pattern.test(col.name))
  );
  
  // Find potential lng columns
  const lngColumns = columns.filter(col => 
    !col.isGeometry && 
    (col.type.includes('DOUBLE') || col.type.includes('FLOAT') || col.type.includes('DECIMAL')) &&
    lngPatterns.some(pattern => pattern.test(col.name))
  );
  
  // Create pairs - try to match by similar naming first
  latColumns.forEach(latCol => {
    // Try to find a matching lng column with similar prefix
    const prefix = latCol.name.replace(/lat.*$/i, '').replace(/y$/i, '');
    let matchedLng = lngColumns.find(lngCol => 
      lngCol.name.startsWith(prefix) || 
      lngCol.name.replace(/lng.*$/i, '').replace(/lon.*$/i, '').replace(/x$/i, '') === prefix
    );
    
    // If no match by prefix, just use the first available lng column
    if (!matchedLng && lngColumns.length > 0) {
      matchedLng = lngColumns[0];
    }
    
    if (matchedLng) {
      pairs.push({
        lat: latCol.name,
        lng: matchedLng.name
      });
    }
  });
  
  return pairs;
}

/**
 * Determine the default layer type based on geometry analysis
 */
function determineLayerType(dataset: Dataset): LayerType | null {
  const geomColumn = dataset.columns.find(col => col.isGeometry);
  
  if (geomColumn) {
    // For geometry columns, we'd need to inspect the actual data
    // For now, use heuristics based on dataset type and name
    if (dataset.type === 'geojson' || dataset.type === 'json') {
      // Check dataset name for hints
      const nameLower = dataset.name.toLowerCase();
      if (nameLower.includes('point') || nameLower.includes('cities') || 
          nameLower.includes('locations') || nameLower.includes('places')) {
        return 'point';
      } else if (nameLower.includes('line') || nameLower.includes('road') || 
                 nameLower.includes('route') || nameLower.includes('path')) {
        return 'line';
      }
      // Default to polygon for GeoJSON (countries, regions, etc.)
      return 'polygon';
    }
    return 'point'; // Default for other geometry types
  }
  
  // Check for lat/lng columns
  const latLngPairs = findLatLngFieldPairs(dataset.columns);
  if (latLngPairs.length > 0) {
    return 'point';
  }
  
  return null;
}

/**
 * Generate a color from a hash of the dataset name
 */
function generateColor(name: string): string {
  // Use a simple hash to generate consistent colors
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  
  // Predefined nice colors (similar to Kepler's palette)
  const colors = [
    '#4f46e5', // Indigo
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#14b8a6', // Teal
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Find default layers for a dataset (Kepler.gl inspired)
 */
export function findDefaultLayers(dataset: Dataset, existingLayers: MapLayer[]): MapLayer[] {
  const layers: MapLayer[] = [];
  
  console.log(`🔍 Finding default layers for dataset: ${dataset.name}`);
  console.log(`  - Type: ${dataset.type}`);
  console.log(`  - Columns:`, dataset.columns.map(c => `${c.name} (${c.type}, geom: ${c.isGeometry})`));
  
  // Check if layers already exist for this dataset
  const hasExistingLayers = existingLayers.some(layer => layer.sourceId === dataset.id);
  if (hasExistingLayers) {
    console.log(`  ⚠️ Layers already exist for this dataset`);
    return layers;
  }
  
  // Determine layer type
  const layerType = determineLayerType(dataset);
  if (!layerType) {
    console.log(`  ❌ No suitable layer type found for dataset: ${dataset.name}`);
    return layers;
  }
  console.log(`  - Determined layer type: ${layerType}`);
  
  // Check for geometry column
  const geomColumn = dataset.columns.find(col => col.isGeometry);
  console.log(`  - Geometry column:`, geomColumn ? geomColumn.name : 'none');
  
  if (geomColumn) {
    // Create layer for geometry column
    const layer: MapLayer = {
      id: `${dataset.id}_${layerType}_0`,
      type: layerType,
      sourceId: dataset.id,
      visible: true, // First layer is visible by default
      style: {
        label: dataset.name,
        color: generateColor(dataset.name),
        opacity: 0.8,
        strokeWidth: dataset.rowCount > 100000 ? 0 : 1, // Disable stroke for large datasets
        radiusFixed: 5,
        filled: true,
        stroked: dataset.rowCount <= 100000,
      }
    };
    
    layers.push(layer);
  } else {
    // Look for lat/lng pairs
    const latLngPairs = findLatLngFieldPairs(dataset.columns);
    
    latLngPairs.forEach((pair, index) => {
      const layer: MapLayer = {
        id: `${dataset.id}_point_${index}`,
        type: 'point',
        sourceId: dataset.id,
        visible: index === 0, // Only first layer visible
        style: {
          label: `${dataset.name} (${pair.lat}/${pair.lng})`,
          color: generateColor(dataset.name + index),
          opacity: 0.8,
          radiusFixed: 5,
          filled: true,
          stroked: true,
          // Store the field pair info
          visualChannels: {
            lat: { field: pair.lat },
            lng: { field: pair.lng }
          }
        }
      };
      
      layers.push(layer);
    });
  }
  
  if (layers.length > 0) {
    console.log(`🗺️ Auto-creating ${layers.length} layer(s) for dataset: ${dataset.name}`);
    layers.forEach(layer => {
      console.log(`  - ${layer.type} layer: ${layer.style?.label || layer.id}`);
    });
  }
  
  return layers;
}
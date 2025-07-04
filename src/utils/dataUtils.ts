import { Field } from '../types/layer.types';

// Field type detection patterns following Kepler.gl
export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  lat: 'latitude',
  lng: 'longitude',
  lon: 'longitude',
  latitude: 'latitude',
  longitude: 'longitude',
  coord: 'coordinates',
  coords: 'coordinates',
  geometry: 'geometry',
  geom: 'geometry',
  the_geom: 'geometry',
  wkt: 'geometry',
  timestamp: 'time',
  time: 'time',
  date: 'time',
  datetime: 'time',
  created_at: 'time',
  updated_at: 'time',
  modified: 'time',
  year: 'time',
  month: 'time',
  day: 'time',
  hour: 'time',
  minute: 'time'
};

// Patterns for detecting field roles
export const LATITUDE_FIELD_NAMES = [
  'lat', 'latitude', 'y', 'ylat', 'lat_deg', 'lat_degree',
  'latitude_deg', 'latitude_degree', 'lati', 'lats'
];

export const LONGITUDE_FIELD_NAMES = [
  'lng', 'lon', 'longitude', 'x', 'xlon', 'lng_deg', 'lng_degree',
  'lon_deg', 'lon_degree', 'longitude_deg', 'longitude_degree', 'long', 'lngs', 'lons'
];

export const ALTITUDE_FIELD_NAMES = [
  'alt', 'altitude', 'z', 'elevation', 'elev', 'height', 'altitude_m', 'altitude_ft'
];

export const GEOMETRY_FIELD_NAMES = [
  'geom', 'geometry', 'the_geom', 'wkt', 'wkb', 'shape', 'geo', 'geojson'
];

export const TIME_FIELD_NAMES = [
  'time', 'timestamp', 'datetime', 'date', 'created', 'updated', 'modified',
  'created_at', 'updated_at', 'modified_at', 'date_time', 'ts'
];

export interface FieldPair {
  lat: Field;
  lng: Field;
  alt?: Field;
}

export interface AnalyzedFields {
  geospatial: {
    geometry?: Field[];
    latitude?: Field[];
    longitude?: Field[];
    altitude?: Field[];
    fieldPairs: FieldPair[];
  };
  temporal: Field[];
  numeric: Field[];
  categorical: Field[];
}

// Detect field type based on name and content
export function detectFieldType(field: Field, sampleData: any[]): string {
  const fieldNameLower = field.name.toLowerCase();
  
  // Check for geometry fields
  if (GEOMETRY_FIELD_NAMES.some(name => fieldNameLower.includes(name))) {
    return 'geometry';
  }
  
  // Check for latitude fields
  if (LATITUDE_FIELD_NAMES.some(name => fieldNameLower === name)) {
    return 'latitude';
  }
  
  // Check for longitude fields
  if (LONGITUDE_FIELD_NAMES.some(name => fieldNameLower === name)) {
    return 'longitude';
  }
  
  // Check for altitude fields
  if (ALTITUDE_FIELD_NAMES.some(name => fieldNameLower.includes(name))) {
    return 'altitude';
  }
  
  // Check for time fields
  if (TIME_FIELD_NAMES.some(name => fieldNameLower.includes(name))) {
    return 'time';
  }
  
  // Analyze sample data for numeric fields
  if (field.type === 'real' || field.type === 'integer') {
    const values = sampleData
      .map(row => row[field.name])
      .filter(v => v != null && !isNaN(v));
    
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      // Check if values are in latitude range
      if (min >= -90 && max <= 90 && fieldNameLower.match(/^(y|lat)/)) {
        return 'latitude';
      }
      
      // Check if values are in longitude range
      if (min >= -180 && max <= 180 && fieldNameLower.match(/^(x|lon|lng)/)) {
        return 'longitude';
      }
    }
    
    return 'numeric';
  }
  
  // Check for categorical fields
  if (field.type === 'string') {
    const uniqueValues = new Set(
      sampleData.map(row => row[field.name]).filter(v => v != null)
    );
    
    // If less than 50% unique values, likely categorical
    if (uniqueValues.size < sampleData.length * 0.5) {
      return 'categorical';
    }
  }
  
  return field.type;
}

// Analyze all fields in a dataset
export function analyzeFields(fields: Field[], sampleData: any[]): AnalyzedFields {
  const result: AnalyzedFields = {
    geospatial: {
      geometry: [],
      latitude: [],
      longitude: [],
      altitude: [],
      fieldPairs: []
    },
    temporal: [],
    numeric: [],
    categorical: []
  };
  
  // First pass: categorize fields
  fields.forEach(field => {
    const detectedType = detectFieldType(field, sampleData);
    
    switch (detectedType) {
      case 'geometry':
        result.geospatial.geometry?.push(field);
        break;
      case 'latitude':
        result.geospatial.latitude?.push(field);
        break;
      case 'longitude':
        result.geospatial.longitude?.push(field);
        break;
      case 'altitude':
        result.geospatial.altitude?.push(field);
        break;
      case 'time':
      case 'timestamp':
      case 'date':
        result.temporal.push(field);
        break;
      case 'numeric':
      case 'real':
      case 'integer':
        result.numeric.push(field);
        break;
      case 'categorical':
      case 'string':
        result.categorical.push(field);
        break;
    }
  });
  
  // Second pass: find lat/lng pairs
  if (result.geospatial.latitude?.length && result.geospatial.longitude?.length) {
    // Simple pairing: match by similar names or order
    const latFields = result.geospatial.latitude;
    const lngFields = result.geospatial.longitude;
    const altFields = result.geospatial.altitude || [];
    
    for (let i = 0; i < Math.min(latFields.length, lngFields.length); i++) {
      const pair: FieldPair = {
        lat: latFields[i],
        lng: lngFields[i]
      };
      
      // Try to find matching altitude field
      if (altFields.length > i) {
        pair.alt = altFields[i];
      }
      
      result.geospatial.fieldPairs.push(pair);
    }
  }
  
  return result;
}

// Get suggested layer type based on analyzed fields
export function getSuggestedLayerType(analyzedFields: AnalyzedFields): string {
  if (analyzedFields.geospatial.geometry?.length) {
    // Check geometry type from sample data
    return 'geojson';
  }
  
  if (analyzedFields.geospatial.fieldPairs.length > 0) {
    return 'point';
  }
  
  // If we have numeric data but no geo fields, suggest non-geo viz
  if (analyzedFields.numeric.length > 0) {
    return 'chart';
  }
  
  return 'table';
}

// Get suggested visual channels based on field types
export function getSuggestedVisualChannels(
  layerType: string,
  analyzedFields: AnalyzedFields
): Record<string, { field: string; scale: string }> {
  const suggestions: Record<string, { field: string; scale: string }> = {};
  
  // Color suggestions
  if (analyzedFields.categorical.length > 0) {
    // Use first categorical field for color
    suggestions.color = {
      field: analyzedFields.categorical[0].name,
      scale: 'ordinal'
    };
  } else if (analyzedFields.numeric.length > 0) {
    // Use first numeric field for color
    suggestions.color = {
      field: analyzedFields.numeric[0].name,
      scale: 'quantile'
    };
  }
  
  // Size suggestions for point layers
  if (layerType === 'point' && analyzedFields.numeric.length > 0) {
    // Find a good numeric field for size (not lat/lng)
    const sizeField = analyzedFields.numeric.find(f => 
      !f.name.toLowerCase().match(/^(lat|lng|lon|x|y)/)
    );
    
    if (sizeField) {
      suggestions.radius = {
        field: sizeField.name,
        scale: 'sqrt'
      };
    }
  }
  
  // Height suggestions for 3D layers
  if (['hexagon', 'grid', 'h3'].includes(layerType) && analyzedFields.numeric.length > 0) {
    suggestions.height = {
      field: analyzedFields.numeric[0].name,
      scale: 'linear'
    };
  }
  
  return suggestions;
}

// Calculate statistics for numeric fields
export interface FieldStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  unique: number;
  nulls: number;
  histogram?: { value: number; count: number }[];
}

export function calculateFieldStats(
  fieldName: string,
  data: any[]
): FieldStats | null {
  const values = data
    .map(row => row[fieldName])
    .filter(v => v != null && !isNaN(v))
    .map(v => Number(v));
  
  if (values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Calculate standard deviation
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  // Count unique values
  const unique = new Set(values).size;
  const nulls = data.length - values.length;
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    stdDev,
    unique,
    nulls
  };
}

// Detect patterns in data
export interface DataPattern {
  type: 'time_series' | 'spatial_cluster' | 'correlation' | 'distribution';
  description: string;
  fields: string[];
  confidence: number;
}

export function detectDataPatterns(
  fields: Field[],
  analyzedFields: AnalyzedFields,
  sampleData: any[]
): DataPattern[] {
  const patterns: DataPattern[] = [];
  
  // Check for time series pattern
  if (analyzedFields.temporal.length > 0 && analyzedFields.numeric.length > 0) {
    patterns.push({
      type: 'time_series',
      description: 'Time-based data with numeric values',
      fields: [analyzedFields.temporal[0].name, ...analyzedFields.numeric.map(f => f.name)],
      confidence: 0.8
    });
  }
  
  // Check for spatial clustering
  if (analyzedFields.geospatial.fieldPairs.length > 0) {
    // Simple check: if we have many points in a small area
    const latField = analyzedFields.geospatial.fieldPairs[0].lat.name;
    const lngField = analyzedFields.geospatial.fieldPairs[0].lng.name;
    
    const coords = sampleData
      .map(row => ({ lat: row[latField], lng: row[lngField] }))
      .filter(c => c.lat != null && c.lng != null);
    
    if (coords.length > 10) {
      const latRange = Math.max(...coords.map(c => c.lat)) - Math.min(...coords.map(c => c.lat));
      const lngRange = Math.max(...coords.map(c => c.lng)) - Math.min(...coords.map(c => c.lng));
      
      if (latRange < 10 && lngRange < 10) {
        patterns.push({
          type: 'spatial_cluster',
          description: 'Points are clustered in a small geographic area',
          fields: [latField, lngField],
          confidence: 0.7
        });
      }
    }
  }
  
  return patterns;
}
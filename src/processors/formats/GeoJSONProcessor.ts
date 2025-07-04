import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { BaseDataProcessor, ProcessorOptions, ProcessorResult } from '../base/DataProcessor';
import { Table, tableFromArrays } from 'apache-arrow';

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export class GeoJSONProcessor extends BaseDataProcessor {
  name = 'GeoJSON';
  supportedExtensions = ['.geojson', '.json'];
  supportedMimeTypes = ['application/geo+json', 'application/json'];
  
  async process(
    db: AsyncDuckDB,
    data: string | File | Blob | ArrayBuffer,
    options?: ProcessorOptions
  ): Promise<ProcessorResult> {
    const startTime = performance.now();
    const conn = await db.connect();
    
    try {
      // Ensure spatial extension is loaded
      try {
        await conn.query("LOAD spatial");
      } catch {
        // Already loaded
      }
      
      let geojson: GeoJSONFeatureCollection;
      let tableName: string;
      
      if (typeof data === 'string') {
        // URL - fetch the data
        tableName = this.generateTableName(data, options);
        const response = await fetch(data);
        if (!response.ok) {
          throw new Error(`Failed to fetch GeoJSON: ${response.status} ${response.statusText}`);
        }
        geojson = await response.json();
      } else if (data instanceof File || data instanceof Blob) {
        tableName = this.generateTableName(
          data instanceof File ? data.name : 'geojson_data',
          options
        );
        const text = await data.text();
        geojson = JSON.parse(text);
      } else {
        throw new Error('Unsupported data type for GeoJSON processor');
      }
      
      // Validate GeoJSON
      if (geojson.type !== 'FeatureCollection') {
        throw new Error('GeoJSON must be a FeatureCollection');
      }
      
      // Create table with properties and geometry
      await conn.query(`CREATE TABLE ${tableName} (properties JSON, geom GEOMETRY)`);
      
      // Insert features with progress reporting
      const totalFeatures = geojson.features.length;
      const batchSize = options?.batchSize || 100;
      
      for (let i = 0; i < totalFeatures; i += batchSize) {
        const batch = geojson.features.slice(i, i + batchSize);
        
        for (const feature of batch) {
          const propertiesJson = JSON.stringify(feature.properties || {});
          const geometryJson = JSON.stringify(feature.geometry);
          
          await conn.query(`
            INSERT INTO ${tableName} (properties, geom) 
            VALUES (
              '${propertiesJson.replace(/'/g, "''")}',
              ST_GeomFromGeoJSON('${geometryJson.replace(/'/g, "''")}')
            )
          `);
        }
        
        this.reportProgress(Math.min(i + batchSize, totalFeatures), totalFeatures, options);
      }
      
      // Create spatial index
      await conn.query(`CREATE INDEX ${tableName}_geom_idx ON ${tableName} USING RTREE (geom)`);
      
      // Get column info
      const columns = [
        { name: 'properties', type: 'JSON' },
        { name: 'geom', type: 'GEOMETRY' }
      ];
      
      // Create visualization-ready view
      let vizTableName: string | undefined;
      try {
        console.log('Creating visualization-ready view...');
        vizTableName = await transformGeoJSONTable(db, tableName);
        console.log('Created visualization view:', vizTableName);
        
        // Add viz table info to columns
        const vizColumnsResult = await conn.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = '${vizTableName}'
          ORDER BY ordinal_position
        `);
        const vizColumns = vizColumnsResult.toArray().map(col => ({
          name: col.column_name,
          type: col.data_type
        }));
        console.log('Visualization columns:', vizColumns.length);
      } catch (vizError) {
        console.error('Warning: Could not create visualization view:', vizError);
        // Continue anyway - the original table is still usable
      }
      
      const processingTime = performance.now() - startTime;
      
      return {
        tableName,
        rowCount: totalFeatures,
        columns,
        processingTime,
        warnings: totalFeatures > 10000 
          ? ['Large dataset detected. Consider using spatial filters for better performance.']
          : undefined,
        metadata: {
          vizTableName,
          message: vizTableName ? `Visualization view created: ${vizTableName}` : undefined
        }
      };
    } finally {
      await conn.close();
    }
  }
  
  async validate(data: string | File | Blob | ArrayBuffer): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    
    try {
      let geojson: GeoJSONFeatureCollection;
      
      if (typeof data === 'string') {
        // For URLs, we can't validate without fetching
        if (!this.canProcess(data)) {
          errors.push('File extension not supported');
        }
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
      } else if (data instanceof File || data instanceof Blob) {
        const text = await data.text();
        try {
          geojson = JSON.parse(text);
        } catch {
          errors.push('Invalid JSON format');
          return { valid: false, errors };
        }
      } else {
        errors.push('Unsupported data type');
        return { valid: false, errors };
      }
      
      // Validate GeoJSON structure
      if (!geojson.type) {
        errors.push('Missing "type" property');
      } else if (geojson.type !== 'FeatureCollection') {
        errors.push('Only FeatureCollection type is supported');
      }
      
      if (!geojson.features || !Array.isArray(geojson.features)) {
        errors.push('Missing or invalid "features" array');
      } else if (geojson.features.length === 0) {
        errors.push('No features found in GeoJSON');
      }
      
      // Check first few features
      const featuresToCheck = geojson.features.slice(0, 10);
      for (let i = 0; i < featuresToCheck.length; i++) {
        const feature = featuresToCheck[i];
        if (!feature.type || feature.type !== 'Feature') {
          errors.push(`Feature ${i} is not of type "Feature"`);
        }
        if (!feature.geometry) {
          errors.push(`Feature ${i} is missing geometry`);
        }
      }
    } catch (e) {
      errors.push('Failed to validate GeoJSON: ' + (e instanceof Error ? e.message : String(e)));
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  async preview(data: string | File | Blob | ArrayBuffer, limit: number = 10): Promise<Table> {
    let geojson: GeoJSONFeatureCollection;
    
    if (typeof data === 'string') {
      const response = await fetch(data);
      geojson = await response.json();
    } else if (data instanceof File || data instanceof Blob) {
      const text = await data.text();
      geojson = JSON.parse(text);
    } else {
      throw new Error('Unsupported data type');
    }
    
    const features = geojson.features.slice(0, limit);
    const columns: Record<string, unknown[]> = {
      geometry_type: [],
      properties: []
    };
    
    for (const feature of features) {
      columns.geometry_type.push(feature.geometry.type);
      columns.properties.push(JSON.stringify(feature.properties));
    }
    
    return tableFromArrays(columns);
  }
}
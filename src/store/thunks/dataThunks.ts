import { createAsyncThunk } from '@reduxjs/toolkit';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

interface TableInfo {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rowCount?: number;
}

/**
 * Async thunk to load all tables from DuckDB
 */
export const loadTables = createAsyncThunk<
  TableInfo[],
  { db: AsyncDuckDB },
  { rejectValue: string }
>(
  'data/loadTables',
  async ({ db }, { rejectWithValue }) => {
    try {
      console.log('Loading tables from DuckDB...');
      
      // Query the information schema for all tables
      const conn = await db.connect();
      const result = await conn.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      const tableNames = result.toArray().map((row: { table_name: string }) => row.table_name);
      
      // Get column information for each table
      const tables: TableInfo[] = await Promise.all(
        tableNames.map(async (tableName) => {
          const columnsResult = await conn.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = '${tableName}' 
            AND table_schema = 'main'
            ORDER BY ordinal_position
          `);
          
          const columns = columnsResult.toArray().map((col: { column_name: string; data_type: string }) => ({
            name: col.column_name,
            type: col.data_type,
          }));
          
          // Try to get row count
          let rowCount: number | undefined;
          try {
            const countResult = await conn.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
            rowCount = countResult.toArray()[0]?.count;
          } catch (error) {
            console.warn(`Failed to get row count for table ${tableName}:`, error);
          }
          
          return {
            name: tableName,
            columns,
            rowCount,
          };
        })
      );
      
      await conn.close();
      
      console.log('Tables loaded successfully:', tables);
      return tables;
    } catch (error) {
      console.error('Failed to load tables:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load tables');
    }
  }
);

/**
 * Async thunk to create a table from a remote file
 */
export const createTableFromUrl = createAsyncThunk<
  string, // Returns the table name
  { db: AsyncDuckDB; url: string; tableName?: string },
  { rejectValue: string }
>(
  'data/createTableFromUrl',
  async ({ db, url, tableName }, { rejectWithValue }) => {
    try {
      const fileName = url.split('/').pop() || 'remote_file';
      const defaultTableName = fileName.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      const finalTableName = tableName || (/^\d/.test(defaultTableName) ? `t_${defaultTableName}` : defaultTableName);
      
      const isParquet = url.toLowerCase().endsWith('.parquet');
      const isCSV = url.toLowerCase().endsWith('.csv');
      const isGeoJSON = url.toLowerCase().endsWith('.geojson') || url.toLowerCase().endsWith('.json');
      
      const conn = await db.connect();
      
      if (isParquet) {
        await conn.query(`CREATE TABLE ${finalTableName} AS SELECT * FROM '${url}'`);
      } else if (isCSV) {
        await conn.query(`CREATE TABLE ${finalTableName} AS SELECT * FROM read_csv_auto('${url}')`);
      } else if (isGeoJSON) {
        // For GeoJSON, fetch the data client-side first
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        const geojsonData = await response.json();
        
        // Validate GeoJSON
        if (geojsonData.type !== 'FeatureCollection') {
          throw new Error('Invalid GeoJSON: Must be a FeatureCollection');
        }
        
        // Create table with properties and geometry columns
        await conn.query(`CREATE TABLE ${finalTableName} (properties JSON, geom GEOMETRY);`);
        
        // Insert features
        for (const feature of geojsonData.features) {
          const propertiesJson = JSON.stringify(feature.properties || {});
          const geometryJson = JSON.stringify(feature.geometry);
          
          await conn.query(`
            INSERT INTO ${finalTableName} (properties, geom) 
            VALUES (
              '${propertiesJson.replace(/'/g, "''")}',
              ST_GeomFromGeoJSON('${geometryJson.replace(/'/g, "''")}')
            )
          `);
        }
      } else {
        throw new Error('Unsupported file format');
      }
      
      await conn.close();
      
      return finalTableName;
    } catch (error) {
      console.error('Failed to create table from URL:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create table');
    }
  }
);
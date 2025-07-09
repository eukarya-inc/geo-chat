import { store } from '@/store';

export interface DataLoaderResult {
  data: any[];
  columns: Array<{
    name: string;
    type: string;
  }>;
  geometryColumn?: string;
}

export async function loadDataForLayer(datasetId: string): Promise<DataLoaderResult | null> {
  const state = store.getState();
  const dataset = state.data.datasets.find(d => d.id === datasetId);
  
  if (!dataset) {
    console.error(`Dataset ${datasetId} not found`);
    return null;
  }
  
  const connection = state.duckdb.connection;
  if (!connection) {
    console.error('DuckDB not initialized');
    return null;
  }
  
  try {
    // Query all data from the table
    // Use the exact dataset name as the table name (DataPanel doesn't lowercase it)
    const tableName = dataset.name;
    console.log(`📊 Loading data for table: ${tableName}`);
    
    // First check if table exists - try SHOW TABLES first
    try {
      const showTablesResult = await connection.query('SHOW TABLES');
      const tables = showTablesResult.toArray();
      console.log('  Available tables:', tables.map(t => t.name));
      
      const tableExists = tables.some(t => t.name === tableName);
      if (!tableExists) {
        console.error(`  ❌ Table ${tableName} not found in SHOW TABLES`);
        return null;
      }
    } catch (error) {
      console.error('  Error with SHOW TABLES:', error);
      // Fall back to information_schema check
      const tableCheckResult = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${tableName}'`
      );
      const tableCheckArray = tableCheckResult.toArray();
      
      if (!tableCheckArray || tableCheckArray.length === 0 || tableCheckArray[0]?.count === 0) {
        console.error(`  ❌ Table ${tableName} not found in information_schema`);
        return null;
      }
    }
    
    // Query the data
    const result = await connection.query(`SELECT * FROM ${tableName}`);
    const data = result.toArray();
    
    // Find geometry column
    const geometryColumn = dataset.columns.find(col => col.isGeometry)?.name;
    
    // Convert DuckDB proxy objects to plain objects and parse geometry
    const processedData = data.map((row: any) => {
      const processedRow: any = {};
      
      // Convert proxy objects and handle BigInt
      for (const key in row) {
        const value = row[key];
        if (typeof value === 'bigint') {
          processedRow[key] = value.toString();
        } else if (value && typeof value === 'object' && value.constructor.name === 'Proxy') {
          // Handle DuckDB proxy objects
          processedRow[key] = JSON.parse(JSON.stringify(value, (_, v) => 
            typeof v === 'bigint' ? v.toString() : v
          ));
        } else {
          processedRow[key] = value;
        }
      }
      
      // Parse geometry if it's in WKT or GeoJSON text format
      if (geometryColumn && processedRow[geometryColumn]) {
        try {
          // Try to parse as JSON (GeoJSON)
          if (typeof processedRow[geometryColumn] === 'string') {
            processedRow[geometryColumn] = JSON.parse(processedRow[geometryColumn]);
          }
        } catch (e) {
          // If not JSON, might be WKT or already parsed
          // Leave as is for now
        }
      }
      
      return processedRow;
    });
    
    return {
      data: processedData,
      columns: dataset.columns,
      geometryColumn
    };
  } catch (error) {
    console.error(`Error loading data for layer ${datasetId}:`, error);
    return null;
  }
}
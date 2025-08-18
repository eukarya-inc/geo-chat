import type { DBContext } from '../lib/duckdb/dbContext';
import { geocodeMultipleAddresses, isLikelyAddress } from '../utils/geocoding';

export interface TableColumn {
  name: string;
  type: string;
  sampleValues: string[];
  isLikelyAddress: boolean;
}

export interface GeocodingTableResult {
  tableName: string;
  totalRows: number;
  addressColumns: TableColumn[];
  recommendations: string[];
}

/**
 * Analyze a table to find potential address columns
 */
export async function analyzeTableForGeocoding(dbContext: DBContext, tableName: string): Promise<GeocodingTableResult> {
  const conn = await dbContext.connect();
  
  try {
    // Get table schema
    const schemaResult = await conn.query(`DESCRIBE ${tableName};`);
    const schema = schemaResult.toArray();
    
    // Get row count
    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName};`);
    const totalRows = countResult.toArray()[0].count as number;
    
    // Analyze each text/varchar column
    const addressColumns: TableColumn[] = [];
    const recommendations: string[] = [];
    
    for (const column of schema) {
      const columnName = column.column_name as string;
      const columnType = column.column_type as string;
      
      // Only analyze text-like columns
      if (columnType.toLowerCase().includes('varchar') || columnType.toLowerCase().includes('text')) {
        // Get sample values
        const sampleResult = await conn.query(
          `SELECT DISTINCT ${columnName} FROM ${tableName} WHERE ${columnName} IS NOT NULL LIMIT 5;`
        );
        const sampleValues = sampleResult.toArray().map(row => String(row[columnName]));
        
        // Check if values look like addresses
        const addressLikeCount = sampleValues.filter(val => isLikelyAddress(val)).length;
        const isLikelyAddressColumn = addressLikeCount > 0;
        
        const tableColumn: TableColumn = {
          name: columnName,
          type: columnType,
          sampleValues,
          isLikelyAddress: isLikelyAddressColumn
        };
        
        if (isLikelyAddressColumn) {
          addressColumns.push(tableColumn);
          recommendations.push(`Column "${columnName}" contains address-like data and can be geocoded`);
        }
      }
    }
    
    if (addressColumns.length === 0) {
      recommendations.push('No obvious address columns found. You can still manually specify a column to geocode.');
    }
    
    return {
      tableName,
      totalRows,
      addressColumns,
      recommendations
    };
    
  } finally {
    await conn.close();
  }
}

/**
 * Add geocoded columns (lat, lng, display_name) to a table
 */
export async function addGeocodedColumnsToTable(
  dbContext: DBContext, 
  tableName: string, 
  addressColumn: string,
  batchSize: number = 10,
  rateLimitMs: number = 1000
): Promise<{ success: boolean; message: string; stats: { total: number; successful: number; failed: number } }> {
  const conn = await dbContext.connect();
  
  try {
    // First, add the new columns if they don't exist
    try {
      await conn.query(`ALTER TABLE ${tableName} ADD COLUMN geocoded_lat DOUBLE;`);
      await conn.query(`ALTER TABLE ${tableName} ADD COLUMN geocoded_lng DOUBLE;`);
      await conn.query(`ALTER TABLE ${tableName} ADD COLUMN geocoded_display_name VARCHAR;`);
    } catch {
      // Columns might already exist, that's okay
    }
    
    // Get all unique addresses that haven't been geocoded yet
    const addressResult = await conn.query(`
      SELECT DISTINCT ${addressColumn} as address 
      FROM ${tableName} 
      WHERE ${addressColumn} IS NOT NULL 
      AND geocoded_lat IS NULL
      LIMIT 100;
    `);
    
    const addresses = addressResult.toArray().map(row => row.address as string);
    
    if (addresses.length === 0) {
      return {
        success: true,
        message: 'No new addresses to geocode',
        stats: { total: 0, successful: 0, failed: 0 }
      };
    }
    
    let successful = 0;
    let failed = 0;
    
    // Process in batches
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const { results, errors } = await geocodeMultipleAddresses(batch, rateLimitMs);
      
      // Update successful geocodes
      for (const result of results) {
        try {
          await conn.query(`
            UPDATE ${tableName} 
            SET geocoded_lat = ${result.latitude}, 
                geocoded_lng = ${result.longitude},
                geocoded_display_name = '${result.display_name.replace(/'/g, "''")}'
            WHERE ${addressColumn} = '${batch.find(addr => addr === result.display_name || true)?.replace(/'/g, "''")}';
          `);
          successful++;
        } catch (updateError) {
          console.error('Error updating geocoded result:', updateError);
          failed++;
        }
      }
      
      failed += errors.length;
    }
    
    return {
      success: true,
      message: `Geocoding completed: ${successful} successful, ${failed} failed`,
      stats: { total: addresses.length, successful, failed }
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      stats: { total: 0, successful: 0, failed: 0 }
    };
  } finally {
    await conn.close();
  }
}

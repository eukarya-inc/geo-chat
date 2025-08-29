export interface GeocodeResult {
  latitude: number;
  longitude: number;
  display_name: string;
  place_id: string;
}

export interface GeocodeError {
  address: string;
  error: string;
}

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
 * Geocode a single address using Nominatim
 */
export async function geocodeSingleAddress(address: string): Promise<GeocodeResult> {
  const encodedAddress = encodeURIComponent(address.trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&addressdetails=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DuckDB-WASM-Prototype/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      throw new Error('No results found');
    }
    
    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      display_name: result.display_name,
      place_id: result.place_id
    };
  } catch (error) {
    throw new Error(`Geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Geocode multiple addresses with rate limiting
 */
export async function geocodeMultipleAddresses(
  addresses: string[], 
  rateLimitMs: number = 1000
): Promise<{ results: GeocodeResult[], errors: GeocodeError[] }> {
  const results: GeocodeResult[] = [];
  const errors: GeocodeError[] = [];
  
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    
    try {
      const result = await geocodeSingleAddress(address);
      results.push(result);
    } catch (error) {
      errors.push({
        address,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    // Rate limiting: wait between requests (except for the last one)
    if (i < addresses.length - 1) {
      await new Promise(resolve => setTimeout(resolve, rateLimitMs));
    }
  }
  
  return { results, errors };
}

/**
 * Simple address detection - checks if text might be an address
 */
export function isLikelyAddress(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const addressPatterns = [
    /\d+\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl)/i,
    /\w+,\s*\w+/,  // City, State pattern
    /\d{5}(-\d{4})?/,  // ZIP code
    /\b\d+\s+\w+\s+\w+/  // Number + two words (simple address pattern)
  ];
  
  return addressPatterns.some(pattern => pattern.test(text.trim()));
}

/**
 * Analyze a table to find potential address columns
 */
export async function analyzeTableForGeocoding(
  dbContext: { 
    executeQuery: (query: string, schema: string | null) => Promise<Record<string, unknown>[]>; 
    describeTable: (tableName: string, schema: string | null) => Promise<Record<string, unknown>[]>; 
  },
  tableName: string
): Promise<GeocodingTableResult> {
  // Get table schema using high-level method
  const schema = await dbContext.describeTable(tableName, null);
  
  // Get row count
  const countResult = await dbContext.executeQuery(`SELECT COUNT(*) as count FROM ${tableName};`, null);
  const totalRows = countResult[0].count as number;
  
  // Analyze each text/varchar column
  const addressColumns: TableColumn[] = [];
  const recommendations: string[] = [];
  
  for (const column of schema) {
    const columnName = column.column_name as string;
    const columnType = column.column_type as string;
    
    // Only analyze text-like columns
    if (columnType.toLowerCase().includes('varchar') || columnType.toLowerCase().includes('text')) {
      // Get sample values
      const sampleResult = await dbContext.executeQuery(
        `SELECT DISTINCT ${columnName} FROM ${tableName} WHERE ${columnName} IS NOT NULL LIMIT 5;`,
        null
      );
      const sampleValues = sampleResult.map((row: Record<string, unknown>) => String(row[columnName]));
      
      // Check if values look like addresses
      const addressLikeCount = sampleValues.filter((val: string) => isLikelyAddress(val)).length;
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
}

/**
 * Add geocoded columns (lat, lng, display_name) to a table
 */
export async function addGeocodedColumnsToTable(
  dbContext: { executeQuery: (query: string, schema: string | null) => Promise<Record<string, unknown>[]> },
  tableName: string, 
  addressColumn: string,
  batchSize: number = 10,
  rateLimitMs: number = 1000
): Promise<{ success: boolean; message: string; stats: { total: number; successful: number; failed: number } }> {
  try {
    // First, add the new columns if they don't exist
    try {
      await dbContext.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN geocoded_lat DOUBLE;`, null);
      await dbContext.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN geocoded_lng DOUBLE;`, null);
      await dbContext.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN geocoded_display_name VARCHAR;`, null);
    } catch {
      // Columns might already exist, that's okay
    }
    
    // Get all unique addresses that haven't been geocoded yet
    const addressResult = await dbContext.executeQuery(`
      SELECT DISTINCT ${addressColumn} as address 
      FROM ${tableName} 
      WHERE ${addressColumn} IS NOT NULL 
      AND geocoded_lat IS NULL
      LIMIT 100;
    `, null);
    
    const addresses = addressResult.map((row: Record<string, unknown>) => row.address as string);
    
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
          await dbContext.executeQuery(`
            UPDATE ${tableName} 
            SET geocoded_lat = ${result.latitude}, 
                geocoded_lng = ${result.longitude},
                geocoded_display_name = '${result.display_name.replace(/'/g, "''")}'
            WHERE ${addressColumn} = '${batch.find((addr: string) => addr === result.display_name || true)?.replace(/'/g, "''")}';
          `, null);
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
  }
}

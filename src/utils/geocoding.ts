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

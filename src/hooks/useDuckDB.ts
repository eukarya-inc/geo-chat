import { useAppSelector } from '../store/hooks';

export function useDuckDB() {
  const { instance, connection, isInitialized, isLoading, error } = useAppSelector(
    state => state.duckdb
  );

  const executeQuery = async (sql: string) => {
    if (!connection) {
      throw new Error('DuckDB not initialized');
    }
    
    try {
      const result = await connection.query(sql);
      const array = result.toArray();
      
      // Convert DuckDB proxy objects to plain objects and handle BigInt
      return array.map((row: any) => {
        const plainRow: any = {};
        for (const key in row) {
          const value = row[key];
          // Convert BigInt to string for JSON serialization
          if (typeof value === 'bigint') {
            plainRow[key] = value.toString();
          } else if (value && typeof value === 'object' && value.constructor.name === 'Proxy') {
            // Handle DuckDB proxy objects by converting to plain object
            plainRow[key] = JSON.parse(JSON.stringify(value, (_, v) => 
              typeof v === 'bigint' ? v.toString() : v
            ));
          } else {
            plainRow[key] = value;
          }
        }
        return plainRow;
      });
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  };

  const registerFileHandle = async (name: string, file: File) => {
    if (!instance) {
      throw new Error('DuckDB not initialized');
    }
    
    try {
      await instance.registerFileHandle(name, file, 2, true);
    } catch (error) {
      console.error('File registration error:', error);
      throw error;
    }
  };

  const testSpatialExtension = async () => {
    try {
      // Test basic spatial function
      const result = await executeQuery(`
        SELECT 
          ST_AsText(ST_Point(139.6917, 35.6895)) as tokyo_point,
          ST_AsText(ST_Buffer(ST_Point(0, 0), 1)) as buffer_test,
          ST_Area(ST_Buffer(ST_Point(0, 0), 1)) as area_test
      `);
      return result;
    } catch (error) {
      console.error('Spatial extension test failed:', error);
      throw error;
    }
  };

  return {
    db: instance,
    connection,
    isInitialized,
    isLoading,
    error,
    executeQuery,
    registerFileHandle,
    testSpatialExtension,
  };
}

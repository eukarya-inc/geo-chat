/**
 * Diagnostic utilities for debugging DuckDB table issues
 */

export async function runDuckDBDiagnostics(executeQuery: (sql: string) => Promise<any[]>) {
  const diagnostics: Record<string, any> = {};
  
  try {
    // 1. Check if spatial extension is loaded
    try {
      const spatialTest = await executeQuery("SELECT ST_AsText(ST_Point(0, 0)) as test_point");
      diagnostics.spatialExtension = { loaded: true, test: spatialTest };
    } catch (_e) {
      diagnostics.spatialExtension = { loaded: false, error: (_e as Error).message };
    }
    
    // 2. List all tables
    try {
      const tables = await executeQuery(`
        SELECT table_name, table_type, sql 
        FROM sqlite_master 
        WHERE type IN ('table', 'view') 
        ORDER BY table_name
      `);
      diagnostics.allTables = tables;
    } catch (_e) {
      diagnostics.allTables = { error: (_e as Error).message };
    }
    
    // 3. Check information_schema tables
    try {
      const infoTables = await executeQuery(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main'
        ORDER BY table_name
      `);
      diagnostics.informationSchemaTables = infoTables;
    } catch (_e) {
      diagnostics.informationSchemaTables = { error: (_e as Error).message };
    }
    
    // 4. Try different table name patterns for UAV data
    const possibleTableNames = [
      'uc16_01_uav_accident',
      't_uc16_01_uav_accident',
      'uav_accident',
      't_uav_accident'
    ];
    
    for (const tableName of possibleTableNames) {
      try {
        const exists = await executeQuery(`SELECT * FROM ${tableName} LIMIT 1`);
        diagnostics[`table_${tableName}`] = { exists: true, sample: exists };
      } catch (_e) {
        diagnostics[`table_${tableName}`] = { exists: false };
      }
    }
    
    // 5. Check for any tables with 'uav' in the name
    try {
      const uavTables = await executeQuery(`
        SELECT table_name 
        FROM sqlite_master 
        WHERE type = 'table' AND LOWER(table_name) LIKE '%uav%'
      `);
      diagnostics.uavTables = uavTables;
    } catch (_e) {
      diagnostics.uavTables = { error: (_e as Error).message };
    }
    
  } catch (error) {
    diagnostics.generalError = (error as Error).message;
  }
  
  return diagnostics;
}

export function formatDiagnosticResults(diagnostics: Record<string, any>): string {
  let output = '=== DuckDB Diagnostics ===\n\n';
  
  // Spatial extension status
  output += '1. Spatial Extension:\n';
  if (diagnostics.spatialExtension?.loaded) {
    output += '   ✓ Loaded successfully\n';
  } else {
    output += `   ✗ Not loaded: ${diagnostics.spatialExtension?.error || 'Unknown error'}\n`;
  }
  output += '\n';
  
  // All tables
  output += '2. All Tables in Database:\n';
  if (Array.isArray(diagnostics.allTables)) {
    if (diagnostics.allTables.length === 0) {
      output += '   No tables found\n';
    } else {
      diagnostics.allTables.forEach((table: any) => {
        output += `   - ${table.table_name} (${table.table_type})\n`;
      });
    }
  } else {
    output += `   Error: ${diagnostics.allTables?.error || 'Unknown error'}\n`;
  }
  output += '\n';
  
  // Information schema tables
  output += '3. Information Schema Tables:\n';
  if (Array.isArray(diagnostics.informationSchemaTables)) {
    if (diagnostics.informationSchemaTables.length === 0) {
      output += '   No tables found in information_schema\n';
    } else {
      diagnostics.informationSchemaTables.forEach((table: any) => {
        output += `   - ${table.table_name}\n`;
      });
    }
  } else {
    output += `   Error: ${diagnostics.informationSchemaTables?.error || 'Unknown error'}\n`;
  }
  output += '\n';
  
  // UAV table checks
  output += '4. UAV Table Checks:\n';
  const tableChecks = Object.entries(diagnostics)
    .filter(([key]) => key.startsWith('table_'))
    .map(([key, value]) => ({
      name: key.replace('table_', ''),
      exists: (value as any).exists
    }));
  
  tableChecks.forEach(check => {
    output += `   - ${check.name}: ${check.exists ? '✓ EXISTS' : '✗ NOT FOUND'}\n`;
  });
  output += '\n';
  
  // Tables with 'uav' in name
  output += '5. Tables containing "uav":\n';
  if (Array.isArray(diagnostics.uavTables)) {
    if (diagnostics.uavTables.length === 0) {
      output += '   No tables with "uav" in the name\n';
    } else {
      diagnostics.uavTables.forEach((table: any) => {
        output += `   - ${table.table_name}\n`;
      });
    }
  } else {
    output += `   Error: ${diagnostics.uavTables?.error || 'Unknown error'}\n`;
  }
  
  return output;
}
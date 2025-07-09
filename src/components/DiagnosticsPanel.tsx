import { useState } from 'react';
import { useDuckDB } from '../hooks/useDuckDB';
import './DiagnosticsPanel.css';

function DiagnosticsPanel() {
  const { executeQuery, isInitialized } = useDuckDB();
  const [results, setResults] = useState<string>('');
  const [isOpen, setIsOpen] = useState(true);

  const runDiagnostics = async () => {
    if (!isInitialized) {
      setResults('DuckDB not initialized yet');
      return;
    }

    let output = '=== DuckDB Diagnostics ===\n\n';
    
    try {
      // Check spatial extension
      output += '1. Checking spatial extension:\n';
      try {
        await executeQuery('SELECT ST_Version()');
        output += '✓ Spatial extension is loaded\n\n';
      } catch {
        output += '✗ Spatial extension not loaded\n\n';
      }

      // Check sqlite_master tables
      output += '2. Tables in sqlite_master:\n';
      try {
        const sqliteTables = await executeQuery(
          "SELECT name, type FROM sqlite_master WHERE type='table'"
        );
        if (sqliteTables.length > 0) {
          sqliteTables.forEach(t => {
            output += `  - ${t.name} (${t.type})\n`;
          });
        } else {
          output += '  No tables found in sqlite_master\n';
        }
      } catch (e) {
        output += `  Error: ${e}\n`;
      }
      output += '\n';

      // Check information_schema tables
      output += '3. Tables in information_schema:\n';
      try {
        const infoTables = await executeQuery(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        );
        if (infoTables.length > 0) {
          infoTables.forEach(t => {
            output += `  - ${t.table_name}\n`;
          });
        } else {
          output += '  No tables found in information_schema\n';
        }
      } catch (e) {
        output += `  Error: ${e}\n`;
      }
      output += '\n';

      // Check for specific table
      output += '4. Checking for uc16_01_uav_accident table:\n';
      try {
        const count = await executeQuery('SELECT COUNT(*) as cnt FROM uc16_01_uav_accident');
        output += `  ✓ Table exists with ${count[0].cnt} rows\n`;
      } catch (e) {
        output += `  ✗ Table does not exist or error: ${e}\n`;
      }
      output += '\n';

      // Check all tables with SHOW TABLES
      output += '5. Tables from SHOW TABLES:\n';
      try {
        const showTables = await executeQuery('SHOW TABLES');
        if (showTables.length > 0) {
          showTables.forEach(t => {
            output += `  - ${t.name}\n`;
          });
        } else {
          output += '  No tables found\n';
        }
      } catch (e) {
        output += `  Error: ${e}\n`;
      }

    } catch (error) {
      output += `\nGeneral error: ${error}`;
    }

    setResults(output);
    console.log('Diagnostics Results:\n' + output);
  };

  const runQueries = async () => {
    if (!isInitialized) {
      setResults('DuckDB not initialized yet');
      return;
    }

    let output = '=== Running Requested Queries ===\n\n';
    
    try {
      // Query 1
      output += '1. SELECT name FROM sqlite_master WHERE type=\'table\':\n';
      try {
        const result1 = await executeQuery("SELECT name FROM sqlite_master WHERE type='table'");
        if (result1.length > 0) {
          result1.forEach(row => {
            output += `  - ${row.name}\n`;
          });
        } else {
          output += '  No results\n';
        }
      } catch (e) {
        output += `  Error: ${e}\n`;
      }
      output += '\n';

      // Query 2
      output += '2. SELECT * FROM uc16_01_uav_accident LIMIT 1:\n';
      try {
        const result2 = await executeQuery('SELECT * FROM uc16_01_uav_accident LIMIT 1');
        if (result2.length > 0) {
          output += '  Result found:\n';
          output += '  ' + JSON.stringify(result2[0], null, 2).replace(/\n/g, '\n  ') + '\n';
        } else {
          output += '  No results (empty table)\n';
        }
      } catch (e) {
        output += `  Error: ${e}\n`;
      }

    } catch (error) {
      output += `\nGeneral error: ${error}`;
    }

    setResults(output);
    console.log('Query Results:\n' + output);
  };

  if (!isOpen) {
    return (
      <button 
        className="diagnostics-toggle"
        onClick={() => setIsOpen(true)}
      >
        Show Diagnostics
      </button>
    );
  }

  return (
    <div className="diagnostics-panel">
      <div className="diagnostics-header">
        <h3>DuckDB Diagnostics</h3>
        <button onClick={() => setIsOpen(false)}>×</button>
      </div>
      <div className="diagnostics-controls">
        <button onClick={runDiagnostics} disabled={!isInitialized}>
          Run Diagnostics
        </button>
        <button onClick={runQueries} disabled={!isInitialized}>
          Run Console Queries
        </button>
      </div>
      {results && (
        <pre className="diagnostics-results">{results}</pre>
      )}
    </div>
  );
}

export default DiagnosticsPanel;
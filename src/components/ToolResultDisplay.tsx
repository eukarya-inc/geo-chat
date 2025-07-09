
interface ToolResultDisplayProps {
  toolCall: {
    name: string;
    args: any;
    result: any;
  };
}

export function ToolResultDisplay({ toolCall }: ToolResultDisplayProps) {
  const { name, result } = toolCall;

  if (!result) return null;

  // Handle describeData tool results
  if (name === 'describeData') {
    if (result.message) {
      return (
        <div className="tool-result describe-data">
          <pre style={{ 
            background: '#f8f9fa', 
            padding: '12px', 
            borderRadius: '6px',
            overflow: 'auto',
            fontSize: '0.9em',
            lineHeight: '1.5'
          }}>
            {result.message}
          </pre>
        </div>
      );
    }
  }

  // Handle executeQuery tool results
  if (name === 'executeQuery') {
    if (result.error) {
      return (
        <div className="tool-result error">
          <p style={{ color: '#dc3545' }}>Error: {result.error}</p>
        </div>
      );
    }

    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const columns = Object.keys(result.data[0]);
      
      return (
        <div className="tool-result query-result">
          <p style={{ marginBottom: '8px', fontSize: '0.9em', color: '#666' }}>
            Query returned {result.data.length} row{result.data.length !== 1 ? 's' : ''}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              borderCollapse: 'collapse', 
              width: '100%', 
              fontSize: '0.9em',
              border: '1px solid #dee2e6'
            }}>
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col} style={{ 
                      border: '1px solid #dee2e6', 
                      padding: '8px',
                      background: '#f8f9fa',
                      fontWeight: 600,
                      textAlign: 'left'
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.slice(0, 10).map((row: any, idx: number) => (
                  <tr key={idx}>
                    {columns.map(col => (
                      <td key={col} style={{ 
                        border: '1px solid #dee2e6', 
                        padding: '8px' 
                      }}>
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {result.data.length > 10 && (
              <p style={{ marginTop: '8px', fontSize: '0.85em', color: '#666', fontStyle: 'italic' }}>
                Showing first 10 rows of {result.data.length}
              </p>
            )}
          </div>
        </div>
      );
    }
  }

  // Handle createMap tool results
  if (name === 'createMap') {
    if (result.success) {
      return (
        <div className="tool-result map-created">
          <p style={{ color: '#28a745', marginTop: '8px' }}>
            ✓ Map layer created successfully
          </p>
        </div>
      );
    }
  }

  // Default display for other tools
  return (
    <div className="tool-result generic">
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '0.9em', color: '#666' }}>
          Tool: {name}
        </summary>
        <pre style={{ 
          background: '#f8f9fa', 
          padding: '8px', 
          borderRadius: '4px',
          fontSize: '0.85em',
          marginTop: '4px'
        }}>
          {JSON.stringify(result, (_, value) => 
            typeof value === 'bigint' ? value.toString() : value
          , 2)}
        </pre>
      </details>
    </div>
  );
}
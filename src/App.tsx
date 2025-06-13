import { useState } from 'react';
import './App.css';
import AIChat from './components/AIChat';
import MapComponent from './components/Map';
import RemoteFile from './components/RemoteFile';
import TableList from './components/TableList';
import { useDuckDB } from './lib/duckdb/useDuckDB';

function App() {
    const { db } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
    const [shouldRefreshTables, setShouldRefreshTables] = useState(0);

    const handleColumnSelect = (tableName: string, columns: string[]) => {
        setSelectedColumns(prev => ({
            ...prev,
            [tableName]: columns,
        }));
    };

    return (
        <div style={{ 
            display: 'flex', 
            height: '100vh', 
            width: '100vw',
            overflow: 'hidden',
            margin: 0,
            padding: 0
        }}>
            {/* Left Half - AI Chat */}
            <div style={{ 
                width: '50%', 
                height: '100vh',
                borderRight: '1px solid #ddd',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {db && <AIChat db={db} />}
            </div>
            
            {/* Right Half - DuckDB and Map */}
            <div style={{ 
                width: '50%', 
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '15px',
                    padding: '10px',
                    flexShrink: 0,
                    backgroundColor: 'white'
                }}>
                    {db && <RemoteFile db={db} onTableCreated={() => setShouldRefreshTables(prev => prev + 1)} />}
                    {db && (
                        <TableList
                            db={db}
                            selectedTable={selectedTable}
                            onTableSelect={setSelectedTable}
                            selectedColumns={selectedColumns}
                            onColumnSelect={handleColumnSelect}
                            key={shouldRefreshTables}
                        />
                    )}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {db && (
                        <MapComponent
                            key={selectedTable || 'no-table'}
                            db={db}
                            selectedTable={selectedTable}
                            selectedColumns={selectedColumns[selectedTable || ''] || []}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;

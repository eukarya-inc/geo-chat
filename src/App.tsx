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
        <>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            {db && (
                <MapComponent
                    key={selectedTable || 'no-table'}
                    db={db}
                    selectedTable={selectedTable}
                    selectedColumns={selectedColumns[selectedTable || ''] || []}
                />
            )}
            {db && <AIChat db={db} />}
        </>
    );
}

export default App;

import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';

interface TableListProps {
    db: AsyncDuckDB;
    dbStateManager?: DBStateManager;
    selectedTable: string | null;
    onTableSelect: (tableName: string) => void;
    selectedColumns: Record<string, string[]>;
    onColumnSelect: (tableName: string, columns: string[]) => void;
}

interface TableInfo {
    name: string;
    count: number;
}

interface ColumnInfo {
    name: string;
    type: string;
}

const TableList: React.FC<TableListProps> = ({ db, dbStateManager, selectedTable, onTableSelect, selectedColumns, onColumnSelect }) => {
    const [show, setShow] = useState(true);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({});
    const mountedRef = useRef(false);

    const fetchTableColumns = useCallback(async (tableName: string) => {
        if (!db) return;

        try {
            const conn = await db.connect();
            const result = await conn.query(`DESCRIBE ${tableName};`);
            const columns = result.toArray().map(row => ({
                name: row.column_name,
                type: row.column_type,
            }));
            setTableColumns(prev => ({
                ...prev,
                [tableName]: columns,
            }));
            await conn.close();
        } catch (err) {
            console.error('Error fetching table columns:', err);
        }
    }, [db]);

    const fetchTables = useCallback(async () => {
        if (!db) {
            console.log('TableList: Database not available');
            return;
        }

        try {
            console.log('TableList: Fetching tables');
            const conn = await db.connect();
            const result = await conn.query('SHOW TABLES;');
            const tableNames = result.toArray().map(row => row.name);

            const tablesWithInfo: TableInfo[] = [];
            for (const tableName of tableNames) {
                try {
                    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName};`);
                    const count = countResult.toArray()[0].count;
                    tablesWithInfo.push({ name: tableName, count: count });
                    
                    // Fetch columns for each table
                    await fetchTableColumns(tableName);
                } catch (err) {
                    console.error(`Error getting count for table ${tableName}:`, err);
                    tablesWithInfo.push({ name: tableName, count: 0 });
                }
            }

            if (mountedRef.current) {
                setTables(tablesWithInfo);
                console.log('TableList: Updated tables:', tablesWithInfo);
            }
            await conn.close();
        } catch (err) {
            console.error('Error fetching tables:', err);
        }
    }, [db, fetchTableColumns]);

    useEffect(() => {
        mountedRef.current = true;
        fetchTables();
    }, [fetchTables, db]);

    // Subscribe to table changes from state manager
    useEffect(() => {
        if (!dbStateManager) return;

        console.log('TableList: Setting up table change listener');
        const unsubscribe = dbStateManager.onTableChange(() => {
            console.log('TableList: Received table change notification, refreshing...');
            fetchTables();
        });

        return () => {
            console.log('TableList: Cleaning up table change listener');
            unsubscribe();
        };
    }, [dbStateManager, fetchTables]);


    const handleDeleteTable = async (tableName: string) => {
        if (!db) return;
        
        if (!window.confirm(`テーブル "${tableName}" を削除しますか？この操作は取り消せません。`)) {
            return;
        }

        try {
            const conn = await db.connect();
            await conn.query(`DROP TABLE ${tableName};`);
            await conn.close();
            
            // Remove from local state
            setTables(prev => prev.filter(table => table.name !== tableName));
            setTableColumns(prev => {
                const newColumns = { ...prev };
                delete newColumns[tableName];
                return newColumns;
            });
            
            // Clear selection if deleted table was selected
            if (selectedTable === tableName) {
                onTableSelect('');
            }
            
            // Notify state manager
            if (dbStateManager) {
                dbStateManager.notifyTableChange();
            }
        } catch (err) {
            console.error('Error deleting table:', err);
            alert('テーブルの削除に失敗しました');
        }
    };

    if (!show) {
        return (
            <button
                onClick={() => setShow(true)}
                style={{
                    position: 'fixed',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0 5px 5px 0',
                    padding: '10px 5px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    zIndex: 1000,
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed'
                }}
            >
                テーブル一覧
            </button>
        );
    }

    return (
        <div style={{ 
            fontSize: '13px'
        }}>
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '8px' 
            }}>
                <strong style={{ fontSize: '14px' }}>Tables</strong>
                <span style={{ fontSize: '11px', color: '#666' }}>
                    {tables.length} table{tables.length !== 1 ? 's' : ''}
                </span>
            </div>

            {tables.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>
                    No tables loaded yet
                </p>
            ) : (
                <select
                    value={selectedTable || ''}
                    onChange={(e) => onTableSelect(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '13px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        backgroundColor: 'white'
                    }}
                >
                    <option value="">Select a table...</option>
                    {tables.map((table) => (
                        <option key={table.name} value={table.name}>
                            {table.name} ({table.count} rows)
                        </option>
                    ))}
                </select>
            )}

            {/* Show columns for selected table */}
            {selectedTable && tableColumns[selectedTable] && (
                <div style={{ marginTop: '8px' }}>
                    <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        marginBottom: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span>Columns for popup:</span>
                        <button
                            onClick={() => handleDeleteTable(selectedTable)}
                            style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                        >
                            Delete table
                        </button>
                    </div>
                    <div style={{ 
                        maxHeight: '150px', 
                        overflowY: 'auto',
                        border: '1px solid #eee',
                        borderRadius: '4px',
                        padding: '4px'
                    }}>
                        {tableColumns[selectedTable].map((column) => (
                            <label 
                                key={column.name} 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    padding: '2px 4px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedColumns[selectedTable]?.includes(column.name) || false}
                                    onChange={(e) => {
                                        const currentColumns = selectedColumns[selectedTable] || [];
                                        const newColumns = e.target.checked
                                            ? [...currentColumns, column.name]
                                            : currentColumns.filter(c => c !== column.name);
                                        onColumnSelect(selectedTable, newColumns);
                                    }}
                                    style={{ marginRight: '6px' }}
                                />
                                <span style={{ flex: 1 }}>{column.name}</span>
                                <span style={{ fontSize: '11px', color: '#999' }}>
                                    {column.type}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TableList;

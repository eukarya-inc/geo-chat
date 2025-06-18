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
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
    const [queryResult, setQueryResult] = useState<Array<Record<string, string | number | boolean | object | null>> | null>(null);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [showDataView, setShowDataView] = useState<string | null>(null); // Track which table's data is being shown
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
        console.log('TableList: fetchTables called');
        if (!db) {
            console.log('TableList: No database available');
            return;
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.log('TableList: Database instance ID:', (db as any).__instanceId || 'no-id');
            const conn = await db.connect();
            const result = await conn.query('SHOW TABLES;');
            const tableNames: string[] = [];
            for (let i = 0; i < result.numRows; i++) {
                tableNames.push(result.getChildAt(0)?.get(i) as string);
            }
            console.log('TableList: Found tables:', tableNames);

            const tablesWithCount = await Promise.all(
                tableNames.map(async tableName => {
                    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                    return {
                        name: tableName,
                        count: countResult.getChildAt(0)?.get(0) as number,
                    };
                })
            );

            console.log('TableList: Setting tables state to:', tablesWithCount.map(t => t.name));
            setTables(tablesWithCount);
            
            setVisibleColumns({});
            
            await conn.close();

            for (const table of tablesWithCount) {
                await fetchTableColumns(table.name);
            }
        } catch (err) {
            console.error('TableList: Error fetching tables:', err);
        }
    }, [db, fetchTableColumns]);

    useEffect(() => {
        mountedRef.current = true;
        fetchTables();
    }, [fetchTables]);

    // Subscribe to table changes from state manager
    useEffect(() => {
        if (!dbStateManager) return;

        console.log('TableList: Subscribing to dbStateManager notifications');
        const unsubscribe = dbStateManager.onTableChange(() => {
            console.log('TableList: Received dbStateManager notification, calling fetchTables');
            fetchTables();
        });

        return unsubscribe;
    }, [dbStateManager, fetchTables]);

    const handleTableNameClick = (tableName: string) => {
        setVisibleColumns(prev => ({
            ...prev,
            [tableName]: !prev[tableName],
        }));
    };

    const handleColumnSelect = (tableName: string, columnName: string) => {
        const currentColumns = selectedColumns[tableName] || [];
        const newColumns = currentColumns.includes(columnName) ? currentColumns.filter(col => col !== columnName) : [...currentColumns, columnName];
        onColumnSelect(tableName, newColumns);
    };

    const handleShowTableData = async (tableName: string) => {
        if (!db) return;

        if (showDataView === tableName) {
            setShowDataView(null);
            setQueryResult(null);
            setQueryError(null);
            return;
        }

        setShowDataView(tableName);

        try {
            const conn = await db.connect();
            const result = await conn.query(`
                SELECT 
                    ST_AsGeoJSON(geom) as geom_json,
                    * EXCLUDE (geom)
                FROM ${tableName} LIMIT 50;
            `);

            const rows = result.toArray().map(row => {
                const newRow = { ...row };
                if (newRow.geom_json) {
                    newRow.geom = JSON.parse(newRow.geom_json);
                    delete newRow.geom_json;
                }
                return newRow;
            });

            setQueryResult(rows);
            setQueryError(null);
            await conn.close();
        } catch (err) {
            console.error('Error fetching table data:', err);
            setQueryError(err instanceof Error ? err.message : 'Unknown error occurred');
            setQueryResult(null);
        }
    };

    const handleTableDelete = async (tableName: string) => {
        if (!db) return;

        if (!window.confirm(`テーブル "${tableName}" を削除してもよろしいですか？`)) {
            return;
        }

        try {
            const conn = await db.connect();
            await conn.query(`DROP TABLE ${tableName};`);
            await conn.close();
            console.log('Table deleted:', tableName);
            
            // If the deleted table is currently selected, unselect it
            if (selectedTable === tableName) {
                onTableSelect(''); // This will be converted to null in App component
            }
            
            // Also trigger dbStateManager notification for consistency
            if (dbStateManager) {
                dbStateManager.notifyTableChange();
            }
            
            // Force immediate refresh after table deletion
            setTimeout(() => {
                fetchTables();
            }, 100);
        } catch (err) {
            console.error('Error deleting table:', err);
            alert('テーブルの削除に失敗しました');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <h3 style={{ margin: 0 }}>テーブル一覧</h3>
                <button onClick={() => setShow(!show)} disabled={!db}>
                    {show ? '隠す' : '表示'}
                </button>
            </div>

            {show && (
                <div className="table-list">
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {tables.map(table => (
                            <li key={table.name} style={{ marginBottom: '8px' }}>
                                <div className="table-name-container" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    backgroundColor: selectedTable === table.name ? '#e3f2fd' : '#f9f9f9',
                                    minHeight: '48px'
                                }}>
                                    <input
                                        type="checkbox"
                                        id={`table-${table.name}`}
                                        checked={selectedTable === table.name}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                onTableSelect(table.name);
                                            } else {
                                                onTableSelect(''); // Unselect
                                            }
                                        }}
                                        style={{ margin: 0 }}
                                    />
                                    <label htmlFor={`table-${table.name}`} style={{ 
                                        flex: 1, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px',
                                        margin: 0,
                                        cursor: 'pointer'
                                    }}>
                                        <span className="table-name" style={{ fontWeight: 'bold' }}>{table.name}</span>
                                        <span className="table-count" style={{ color: '#666', fontSize: '0.9em' }}>({table.count.toLocaleString()}行)</span>
                                    </label>
                                    <div style={{ 
                                        display: 'flex', 
                                        gap: '6px', 
                                        alignItems: 'center',
                                        flexShrink: 0
                                    }}>
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                handleTableNameClick(table.name);
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                border: '1px solid #6c757d',
                                                borderRadius: '4px',
                                                backgroundColor: visibleColumns[table.name] ? '#6c757d' : '#fff',
                                                color: visibleColumns[table.name] ? '#fff' : '#6c757d',
                                                cursor: 'pointer',
                                                minWidth: '70px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: '500',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {visibleColumns[table.name] ? '✕ 閉じる' : '📋 カラム'}
                                        </button>
                                        <button 
                                            onClick={() => handleShowTableData(table.name)}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                border: `1px solid ${showDataView === table.name ? '#dc3545' : '#007bff'}`,
                                                borderRadius: '4px',
                                                backgroundColor: showDataView === table.name ? '#dc3545' : '#007bff',
                                                color: 'white',
                                                cursor: 'pointer',
                                                minWidth: '60px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: '500',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {showDataView === table.name ? '✕ 閉じる' : '📊 一覧'}
                                        </button>
                                        <button 
                                            onClick={() => handleTableDelete(table.name)}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                border: '1px solid #dc3545',
                                                borderRadius: '4px',
                                                backgroundColor: '#dc3545',
                                                color: 'white',
                                                cursor: 'pointer',
                                                minWidth: '50px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: '500'
                                            }}
                                        >
                                            削除
                                        </button>
                                    </div>
                                </div>
                                {tableColumns[table.name] && visibleColumns[table.name] && (
                                    <div style={{
                                        marginTop: '8px',
                                        border: '1px solid #ddd',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        backdropFilter: 'blur(10px)',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                    }}>
                                        {/* Header */}
                                        <div style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid #ddd',
                                            backgroundColor: '#f8f9fa',
                                            borderRadius: '6px 6px 0 0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <h4 style={{ 
                                                margin: 0, 
                                                fontSize: '14px', 
                                                fontWeight: 'bold',
                                                color: '#495057'
                                            }}>
                                                📋 テーブルカラム ({tableColumns[table.name].length})
                                            </h4>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>
                                                選択: {(selectedColumns[table.name] || []).length} / {tableColumns[table.name].length}
                                            </div>
                                        </div>

                                        {/* Column List */}
                                        <div style={{
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            padding: '8px'
                                        }}>
                                            {tableColumns[table.name].map(column => (
                                                <div key={column.name} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '4px 8px',
                                                    margin: '1px 0',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => handleColumnSelect(table.name, column.name)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={(selectedColumns[table.name] || []).includes(column.name)}
                                                        onChange={() => handleColumnSelect(table.name, column.name)}
                                                        style={{ 
                                                            margin: 0,
                                                            cursor: 'pointer'
                                                        }}
                                                    />
                                                    <span style={{ 
                                                        fontSize: '12px',
                                                        color: '#212529'
                                                    }}>
                                                        {column.name}
                                                    </span>
                                                    <span style={{ 
                                                        fontSize: '10px', 
                                                        color: '#6c757d',
                                                        marginLeft: 'auto'
                                                    }}>
                                                        {column.type}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Footer */}
                                        <div style={{
                                            padding: '8px 16px',
                                            borderTop: '1px solid #dee2e6',
                                            backgroundColor: '#f8f9fa',
                                            borderRadius: '0 0 6px 6px',
                                            fontSize: '11px',
                                            color: '#6c757d'
                                        }}>
                                            💡 カラムをクリックして選択/解除
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                    {queryError && <div className="query-error">{queryError}</div>}
                    {queryResult && showDataView && (
                        <div style={{
                            marginTop: '12px',
                            border: '1px solid #dee2e6',
                            borderRadius: '8px',
                            backgroundColor: 'white',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            overflow: 'hidden'
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid #dee2e6',
                                backgroundColor: '#f8f9fa',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <h4 style={{ 
                                        margin: 0, 
                                        fontSize: '14px', 
                                        fontWeight: '600',
                                        color: '#495057'
                                    }}>
                                        📊 {showDataView} データ
                                    </h4>
                                    <div style={{ 
                                        fontSize: '11px', 
                                        color: '#6c757d',
                                        marginTop: '2px'
                                    }}>
                                        {queryResult.length} 行 (最大50行まで表示)
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowDataView(null);
                                        setQueryResult(null);
                                        setQueryError(null);
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '16px',
                                        cursor: 'pointer',
                                        color: '#6c757d',
                                        padding: '4px'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Table Container */}
                            <div style={{ 
                                maxHeight: '300px',
                                overflow: 'auto',
                                backgroundColor: '#fafafa'
                            }}>
                                <table style={{ 
                                    width: '100%', 
                                    borderCollapse: 'separate',
                                    borderSpacing: 0
                                }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            {Object.keys(queryResult[0]).map(key => (
                                                <th key={key} style={{
                                                    padding: '10px 12px',
                                                    textAlign: 'left',
                                                    backgroundColor: '#e9ecef',
                                                    borderBottom: '2px solid #dee2e6',
                                                    fontWeight: '600',
                                                    fontSize: '11px',
                                                    color: '#495057',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {key}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queryResult.map((row, index) => (
                                            <tr key={index} style={{
                                                backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa'
                                            }}>
                                                {Object.entries(row).map(([key, value]) => (
                                                    <td key={key} style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #e9ecef',
                                                        fontSize: '11px',
                                                        color: '#212529',
                                                        maxWidth: '150px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {key === 'geom' ? (
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '2px 6px',
                                                                backgroundColor: '#e3f2fd',
                                                                color: '#1976d2',
                                                                borderRadius: '3px',
                                                                fontSize: '10px',
                                                                fontWeight: '500',
                                                                cursor: 'pointer'
                                                            }}
                                                            title={JSON.stringify(value, null, 2)}
                                                            >
                                                                {value && typeof value === 'object' && 'type' in value ? 
                                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                                    `${(value as any).type}` : 
                                                                    'Geometry'}
                                                            </span>
                                                        ) : (
                                                            <span title={String(value)}>
                                                                {String(value)}
                                                            </span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TableList;

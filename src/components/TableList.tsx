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
    const [queryResult, setQueryResult] = useState<Array<Record<string, string | number | boolean | object | null>> | null>(null);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [showDataView, setShowDataView] = useState<string | null>(null);
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
            
            // Auto-select "properties" column if it exists and no columns are selected yet
            const hasPropertiesColumn = columns.some(col => col.name === 'properties');
            const currentlySelectedColumns = selectedColumns[tableName] || [];
            
            if (hasPropertiesColumn && currentlySelectedColumns.length === 0) {
                console.log(`Auto-selecting "properties" column for table: ${tableName}`);
                onColumnSelect(tableName, ['properties']);
            }
            
            await conn.close();
        } catch (err) {
            console.error('Error fetching table columns:', err);
        }
    }, [db, selectedColumns, onColumnSelect]);

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

    const handleColumnCheckboxChange = (tableName: string, columnName: string, checked: boolean) => {
        const currentColumns = selectedColumns[tableName] || [];
        const newColumns = checked 
            ? [...currentColumns, columnName]
            : currentColumns.filter(col => col !== columnName);
        
        onColumnSelect(tableName, newColumns);
    };

    const handleShowData = async (tableName: string) => {
        if (!db) return;

        try {
            setQueryError(null);
            const conn = await db.connect();
            const result = await conn.query(`SELECT * FROM ${tableName} LIMIT 100;`);
            const data = result.toArray();
            setQueryResult(data);
            setShowDataView(tableName);
            await conn.close();
        } catch (err) {
            console.error('Error executing query:', err);
            setQueryError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

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
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '8px', 
            border: '1px solid #ddd',
            position: 'relative'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#333' }}>テーブル一覧</h3>
                <button
                    onClick={() => setShow(false)}
                    style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        fontSize: '18px',
                        cursor: 'pointer',
                        color: '#666'
                    }}
                >
                    ×
                </button>
            </div>

            {tables.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontStyle: 'italic' }}>
                    テーブルが見つかりません。リモートファイルを読み込んでください。
                </p>
            ) : (
                tables.map((table) => (
                    <div key={table.name} style={{ 
                        marginBottom: '20px', 
                        padding: '12px', 
                        border: selectedTable === table.name ? '2px solid #007bff' : '1px solid #e0e0e0',
                        borderRadius: '6px',
                        backgroundColor: selectedTable === table.name ? '#f8f9ff' : '#fafafa'
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '8px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <strong 
                                    style={{ 
                                        color: '#333',
                                        cursor: 'pointer',
                                        textDecoration: selectedTable === table.name ? 'underline' : 'none'
                                    }}
                                    onClick={() => onTableSelect(table.name)}
                                >
                                    {table.name}
                                </strong>
                                <span style={{ 
                                    fontSize: '12px', 
                                    color: '#666',
                                    backgroundColor: '#e9ecef',
                                    padding: '2px 6px',
                                    borderRadius: '10px'
                                }}>
                                    {table.count.toLocaleString()} 行
                                </span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => handleShowData(table.name)}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        border: '1px solid #28a745',
                                        borderRadius: '4px',
                                        backgroundColor: '#fff',
                                        color: '#28a745',
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
                                    📊 データ
                                </button>
                                <button
                                    onClick={() => handleDeleteTable(table.name)}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        border: '1px solid #dc3545',
                                        borderRadius: '4px',
                                        backgroundColor: '#fff',
                                        color: '#dc3545',
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
                                    🗑️ 削除
                                </button>
                            </div>
                        </div>

                        {/* Column selection */}
                        {tableColumns[table.name] && (
                            <div>
                                <div style={{ 
                                    fontSize: '12px', 
                                    fontWeight: 'bold', 
                                    marginBottom: '8px',
                                    color: '#555'
                                }}>
                                    表示するカラム:
                                </div>
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
                                    gap: '6px',
                                    maxHeight: '120px',
                                    overflowY: 'auto',
                                    padding: '8px',
                                    backgroundColor: '#f8f9fa',
                                    borderRadius: '4px',
                                    border: '1px solid #e9ecef'
                                }}>
                                    {tableColumns[table.name].map((column) => (
                                        <label 
                                            key={column.name} 
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                                padding: '2px'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={(selectedColumns[table.name] || []).includes(column.name)}
                                                onChange={(e) => handleColumnCheckboxChange(table.name, column.name, e.target.checked)}
                                                style={{ marginRight: '6px' }}
                                            />
                                            <span style={{ color: '#333', fontWeight: '500' }}>{column.name}</span>
                                            <span style={{ 
                                                color: '#6c757d', 
                                                marginLeft: '4px',
                                                fontSize: '10px'
                                            }}>
                                                ({column.type})
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}

            {/* Data View Panel */}
            {showDataView && queryResult && (
                <div style={{
                    position: 'fixed',
                    top: '10%',
                    left: '10%',
                    right: '10%',
                    bottom: '10%',
                    backgroundColor: 'white',
                    border: '2px solid #007bff',
                    borderRadius: '8px',
                    padding: '20px',
                    zIndex: 1000,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '15px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid #eee'
                    }}>
                        <h4 style={{ margin: 0, color: '#333' }}>
                            {showDataView} - データプレビュー (最大100行)
                        </h4>
                        <button
                            onClick={() => {
                                setShowDataView(null);
                                setQueryResult(null);
                                setQueryError(null);
                            }}
                            style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            閉じる
                        </button>
                    </div>

                    {queryError ? (
                        <div style={{
                            color: '#dc3545',
                            backgroundColor: '#f8d7da',
                            border: '1px solid #f5c6cb',
                            borderRadius: '4px',
                            padding: '12px',
                            marginBottom: '15px'
                        }}>
                            エラー: {queryError}
                        </div>
                    ) : (
                        <div style={{
                            flex: 1,
                            overflow: 'auto',
                            border: '1px solid #ddd',
                            borderRadius: '4px'
                        }}>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '12px'
                            }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                                        {queryResult.length > 0 && Object.keys(queryResult[0]).map((key) => (
                                            <th key={key} style={{
                                                border: '1px solid #ddd',
                                                padding: '8px',
                                                textAlign: 'left',
                                                fontWeight: 'bold',
                                                position: 'sticky',
                                                top: 0,
                                                backgroundColor: '#f8f9fa'
                                            }}>
                                                {key}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {queryResult.map((row, index) => (
                                        <tr key={index} style={{
                                            backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9'
                                        }}>
                                            {Object.entries(row).map(([key, value]) => (
                                                <td key={key} style={{
                                                    border: '1px solid #ddd',
                                                    padding: '6px',
                                                    maxWidth: '200px',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {value === null ? '(null)' : String(value)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TableList;

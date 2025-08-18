import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { DBContext } from '../lib/duckdb/dbContext';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Table } from './Table';

interface TableListProps {
    dbContext: DBContext;
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

const TableList: React.FC<TableListProps> = ({ dbContext, selectedTable, onTableSelect, selectedColumns, onColumnSelect }) => {
    const [show, setShow] = useState(true);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({});
    const [showDataView, setShowDataView] = useState<string | null>(null);
    const [connection, setConnection] = useState<AsyncDuckDBConnection | null>(null);
    const mountedRef = useRef(false);

    const fetchTableColumns = useCallback(async (tableName: string) => {
        if (!dbContext) return;

        try {
            const conn = await dbContext.connect();
            const result = await conn.query(`DESCRIBE ${tableName};`);
            const columns = result.toArray().map(row => ({
                name: row.column_name,
                type: row.column_type,
            }));
            setTableColumns(prev => ({
                ...prev,
                [tableName]: columns,
            }));
            
            // Auto-select all columns except geometry when none are selected
            const currentlySelectedColumns = selectedColumns[tableName] || [];
            
            if (currentlySelectedColumns.length === 0) {
                // Select all columns except geometry columns
                const allColumns = columns
                    .filter(col => 
                        col.name.toLowerCase() !== 'geom' && 
                        col.name.toLowerCase() !== 'geometry' &&
                        !col.type.toLowerCase().includes('geometry')
                    )
                    .map(col => col.name);
                
                console.log(`Auto-selecting all columns for table ${tableName}:`, allColumns);
                onColumnSelect(tableName, allColumns);
            }
            
            await conn.close();
        } catch (err) {
            console.error('Error fetching table columns:', err);
        }
    }, [dbContext, selectedColumns, onColumnSelect]);

    const fetchTables = useCallback(async () => {
        if (!dbContext) {
            console.log('TableList: Database not available');
            return;
        }

        try {
            console.log('TableList: Fetching tables');
            const conn = await dbContext.connect();
            const result = await conn.query('SHOW TABLES;');
            const allTableNames = result.toArray().map(row => row.name);
            
            // Filter out temporary analysis tables
            const isTemporaryTable = (name: string): boolean => {
                const lowerName = name.toLowerCase();
                return (
                    lowerName.startsWith('temp_') ||
                    lowerName.startsWith('tmp_') ||
                    lowerName.endsWith('_temp') ||
                    lowerName.endsWith('_tmp') ||
                    lowerName.endsWith('_timeline') ||
                    lowerName.endsWith('_stats') ||
                    lowerName.endsWith('_analysis') ||
                    lowerName.includes('_accidents') || // e.g., prefecture_accidents
                    lowerName === 'incident_dates' ||
                    lowerName === 'incident_timeline'
                );
            };
            
            const tableNames = allTableNames.filter(name => !isTemporaryTable(name));
            console.log(`TableList: Filtered ${allTableNames.length} tables to ${tableNames.length} (hidden ${allTableNames.length - tableNames.length} temporary tables)`);

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
    }, [dbContext, fetchTableColumns]);

    useEffect(() => {
        mountedRef.current = true;
        fetchTables();
    }, [fetchTables, dbContext]);

    // Subscribe to table changes from state manager
    useEffect(() => {
        if (!dbContext) return;

        console.log('TableList: Setting up table change listener');
        const unsubscribe = dbContext.onTableChange(() => {
            console.log('TableList: Received table change notification, refreshing...');
            fetchTables();
        });

        return () => {
            console.log('TableList: Cleaning up table change listener');
            unsubscribe();
        };
    }, [dbContext, fetchTables]);

    const handleColumnCheckboxChange = (tableName: string, columnName: string, checked: boolean) => {
        const currentColumns = selectedColumns[tableName] || [];
        const newColumns = checked 
            ? [...currentColumns, columnName]
            : currentColumns.filter(col => col !== columnName);
        
        onColumnSelect(tableName, newColumns);
    };

    const handleShowData = async (tableName: string) => {
        if (!dbContext) return;

        try {
            const conn = await dbContext.connect();
            setConnection(conn);
            setShowDataView(tableName);
        } catch (err) {
            console.error('Error opening table view:', err);
        }
    };

    const handleDeleteTable = async (tableName: string) => {
        if (!dbContext) return;
        
        if (!window.confirm(`テーブル "${tableName}" を削除しますか？この操作は取り消せません。`)) {
            return;
        }

        try {
            const conn = await dbContext.connect();
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
            if (dbContext) {
                dbContext.notifyTableChange();
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
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '8px'
                                }}>
                                    <div style={{ 
                                        fontSize: '12px', 
                                        fontWeight: 'bold', 
                                        color: '#555'
                                    }}>
                                        表示するカラム:
                                    </div>
                                    <button
                                        onClick={() => {
                                            const columns = tableColumns[table.name] || [];
                                            const currentSelection = selectedColumns[table.name] || [];
                                            
                                            if (currentSelection.length === columns.filter(c => c.name.toLowerCase() !== 'geom' && c.name.toLowerCase() !== 'geometry').length) {
                                                // All are selected, so deselect all
                                                onColumnSelect(table.name, []);
                                            } else {
                                                // Select all non-geometry columns
                                                const allColumnNames = columns
                                                    .filter(col => 
                                                        col.name.toLowerCase() !== 'geom' && 
                                                        col.name.toLowerCase() !== 'geometry' &&
                                                        !col.type.toLowerCase().includes('geometry')
                                                    )
                                                    .map(col => col.name);
                                                onColumnSelect(table.name, allColumnNames);
                                            }
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '11px',
                                            backgroundColor: '#007bff',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {(selectedColumns[table.name] || []).length === (tableColumns[table.name] || []).filter((c: ColumnInfo) => c.name.toLowerCase() !== 'geom' && c.name.toLowerCase() !== 'geometry').length ? 'すべて解除' : 'すべて選択'}
                                    </button>
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
            {showDataView && connection && (
                <>
                    {/* Backdrop */}
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 9999,
                    }} />
                    
                    {/* Modal */}
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
                    zIndex: 10000,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
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
                            {showDataView} - データビュー
                        </h4>
                        <button
                            onClick={async () => {
                                setShowDataView(null);
                                if (connection) {
                                    await connection.close();
                                    setConnection(null);
                                }
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

                    <div style={{
                        flex: 1,
                        overflow: 'hidden'
                    }}>
                        <Table 
                            connection={connection} 
                            tableName={showDataView} 
                        />
                    </div>
                </div>
                </>
            )}
        </div>
    );
};

export default TableList;

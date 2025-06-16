import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import React, { useCallback, useEffect, useState } from 'react';

interface TableListProps {
    db: AsyncDuckDB;
    selectedTable: string | null;
    onTableSelect: (tableName: string) => void;
    selectedColumns: Record<string, string[]>;
    onColumnSelect: (tableName: string, columns: string[]) => void;
    onTableCreated?: () => void;
}

interface TableInfo {
    name: string;
    count: number;
}

interface ColumnInfo {
    name: string;
    type: string;
}

const TableList: React.FC<TableListProps> = ({ db, selectedTable, onTableSelect, selectedColumns, onColumnSelect, onTableCreated }) => {
    const [show, setShow] = useState(true);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({});
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
    const [queryResult, setQueryResult] = useState<Array<Record<string, string | number | boolean | object | null>> | null>(null);
    const [queryError, setQueryError] = useState<string | null>(null);

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
        if (!db) return;

        try {
            const conn = await db.connect();
            const result = await conn.query('SHOW TABLES;');
            const tableNames: string[] = [];
            for (let i = 0; i < result.numRows; i++) {
                tableNames.push(result.getChildAt(0)?.get(i) as string);
            }

            const tablesWithCount = await Promise.all(
                tableNames.map(async tableName => {
                    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                    return {
                        name: tableName,
                        count: countResult.getChildAt(0)?.get(0) as number,
                    };
                })
            );

            setTables(tablesWithCount);
            await conn.close();

            for (const table of tablesWithCount) {
                await fetchTableColumns(table.name);
            }
        } catch (err) {
            console.error('Error fetching tables:', err);
        }
    }, [db, fetchTableColumns]);

    useEffect(() => {
        if (onTableCreated) {
            onTableCreated();
        }
        fetchTables();
    }, [db, onTableCreated, fetchTables]);

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

        try {
            const conn = await db.connect();
            const result = await conn.query(`
                SELECT 
                    ST_AsGeoJSON(geom) as geom_json,
                    * EXCLUDE (geom)
                FROM ${tableName};
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
            fetchTables();
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
                    <ul>
                        {tables.map(table => (
                            <li key={table.name} className="table-item">
                                <div className="table-name-container">
                                    <input
                                        type="radio"
                                        name="table-select"
                                        id={`table-${table.name}`}
                                        checked={selectedTable === table.name}
                                        onChange={() => onTableSelect(table.name)}
                                    />
                                    <label htmlFor={`table-${table.name}`}>
                                        <span className="table-name">{table.name}</span>
                                        <span className="table-count">({table.count.toLocaleString()}行)</span>
                                    </label>
                                    <button
                                        className="column-button"
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleTableNameClick(table.name);
                                        }}
                                    >
                                        カラム
                                    </button>
                                    <div className="table-buttons">
                                        <button onClick={() => handleShowTableData(table.name)}>一覧</button>
                                        <button onClick={() => handleTableDelete(table.name)}>削除</button>
                                    </div>
                                </div>
                                {tableColumns[table.name] && visibleColumns[table.name] && (
                                    <div className="table-columns">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>表示</th>
                                                    <th>カラム名</th>
                                                    <th>型</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tableColumns[table.name].map(column => (
                                                    <tr key={column.name}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                checked={(selectedColumns[table.name] || []).includes(column.name)}
                                                                onChange={() => handleColumnSelect(table.name, column.name)}
                                                            />
                                                        </td>
                                                        <td>{column.name}</td>
                                                        <td>{column.type}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                    {queryError && <div className="query-error">{queryError}</div>}
                    {queryResult && (
                        <div className="query-result">
                            <table>
                                <thead>
                                    <tr>
                                        {Object.keys(queryResult[0]).map(key => (
                                            <th key={key}>{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {queryResult.map((row, index) => (
                                        <tr key={index}>
                                            {Object.entries(row).map(([key, value]) => (
                                                <td key={key}>{key === 'geom' ? <pre>{JSON.stringify(value, null, 2)}</pre> : String(value)}</td>
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

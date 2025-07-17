import React, { useState, useEffect } from 'react';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

interface TableSelectorProps {
  connection: AsyncDuckDBConnection | null;
  selectedTable: string | null;
  onTableSelect: (tableName: string | null) => void;
  refreshTrigger?: number;
}

const TableSelector: React.FC<TableSelectorProps> = ({ connection, selectedTable, onTableSelect, refreshTrigger }) => {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTables = async () => {
      if (!connection) {
        setTables([]);
        return;
      }

      setLoading(true);
      try {
        const result = await connection.query('SHOW TABLES');
        const tableRows = result.toArray();
        const tableNames = tableRows.map(row => row.name as string).sort();
        setTables(tableNames);
        console.log('TableSelector: Fetched tables:', tableNames);
      } catch (error) {
        console.error('TableSelector: Error fetching tables:', error);
        setTables([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [connection, refreshTrigger]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onTableSelect(value === '' ? null : value);
  };

  return (
    <div className="w-full">
      <select
        value={selectedTable || ''}
        onChange={handleChange}
        disabled={loading || !connection}
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
      >
        <option value="" className="text-gray-500">-- テーブルを選択 --</option>
        {tables.map(table => (
          <option key={table} value={table} className="text-gray-900">
            {table}
          </option>
        ))}
      </select>
      {loading && (
        <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></span>
          読み込み中...
        </div>
      )}
    </div>
  );
};

export default TableSelector;
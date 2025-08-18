import React, { useState, useEffect, useCallback } from 'react';
import type { DBContext } from '../lib/duckdb/dbContext';

interface TableSelectorProps {
  dbContext: DBContext;
  selectedTable: string | null;
  onTableSelect: (tableName: string | null) => void;
  refreshTrigger?: number;
}

const TableSelector: React.FC<TableSelectorProps> = ({ dbContext, selectedTable, onTableSelect, refreshTrigger }) => {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Function to fetch tables
  const fetchTables = useCallback(async () => {
    if (!dbContext) {
      setTables([]);
      return;
    }

    setLoading(true);

    try {
      const tableNames = await dbContext.getTables();
      setTables(tableNames);
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [dbContext]);

  // Initial fetch and refresh on prop changes
  useEffect(() => {
    fetchTables();
  }, [fetchTables, refreshTrigger]);

  // Subscribe to table changes from dbContext
  useEffect(() => {
    if (!dbContext) return;

    const unsubscribe = dbContext.onTableChange(() => {
      // Refresh table list when tables change
      // Add a small delay to ensure the table is fully created
      setTimeout(() => {
        fetchTables();
      }, 600);
    });

    return () => {
      unsubscribe();
    };
  }, [dbContext, fetchTables]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onTableSelect(value === '' ? null : value);
  };


  return (
    <div className="w-full">
      <select
        value={selectedTable || ''}
        onChange={handleChange}
        disabled={loading || !dbContext}
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

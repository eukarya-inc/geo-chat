import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface TableSelectorProps {
  dbContext: DBContext;
  selectedTable: string | null;
  onTableSelect: (tableName: string | null) => void;
  schema?: string | null;
}

const TableSelector: React.FC<TableSelectorProps> = ({ dbContext, selectedTable, onTableSelect, schema = null }) => {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Function to fetch tables
  const fetchTables = useCallback(async () => {
    if (!dbContext) {
      setTables([]);
      return;
    }

    setLoading(true);

    try {
      const tableNames = await dbContext.getTables(schema);
      setTables(tableNames);
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [dbContext, schema]);

  // Initial fetch and refresh on prop changes
  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Subscribe to table changes from dbContext
  useEffect(() => {
    if (!dbContext) return;

    const unsubscribe = dbContext.onTableChange((tableName?: string, notifySchema?: string | null) => {
      // Only refresh if the change is for our schema
      if (notifySchema !== schema) {
        return;
      }
      // Refresh table list when tables change
      // Add a small delay to ensure the table is fully created
      setTimeout(() => {
        fetchTables();
      }, 600);
    });

    return () => {
      unsubscribe();
    };
  }, [dbContext, fetchTables, schema]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onTableSelect(value === '' ? null : value);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleDownload = async (format: 'parquet' | 'csv' | 'json') => {
    if (!dbContext || !selectedTable) return;

    try {
      setShowMenu(false);
      
      // Use the new downloadTable method
      const blob = await dbContext.downloadTable(selectedTable, format, schema);
      
      // Determine file extension
      const extension = format === 'parquet' ? 'parquet' : format === 'csv' ? 'csv' : 'json';
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTable}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Failed to download table as ${format}:`, error);
      alert('テーブルのダウンロードに失敗しました');
    }
  };


  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <select
          value={selectedTable || ''}
          onChange={handleChange}
          disabled={loading || !dbContext}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
        >
          <option value="" className="text-gray-500">-- テーブルを選択 --</option>
          {tables.map(table => (
            <option key={table} value={table} className="text-gray-900">
              {table}
            </option>
          ))}
        </select>
        
        {/* Menu button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            disabled={!dbContext || !selectedTable}
            className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
            title="メニュー"
          >
            <svg 
              className="w-4 h-4" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          
          {/* Dropdown menu */}
          {showMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={() => handleDownload('parquet')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                >
                  Parquet形式でダウンロード
                </button>
                <button
                  onClick={() => handleDownload('csv')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                >
                  CSV形式でダウンロード
                </button>
                <button
                  onClick={() => handleDownload('json')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                >
                  JSON形式でダウンロード
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
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

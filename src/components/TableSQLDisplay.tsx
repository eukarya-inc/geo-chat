import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';
import type { SQLHistoryEntry } from '../lib/duckdb/sqlHistoryManager';
import { SQLFlowVisualization } from './SQLFlowVisualization';

interface TableSQLDisplayProps {
  tableName: string | null;
  dbStateManager: DBStateManager | null;
}

export default function TableSQLDisplay({ tableName, dbStateManager }: TableSQLDisplayProps) {
  const [sqlEntry, setSqlEntry] = useState<SQLHistoryEntry | undefined>(undefined);
  const [showVisualization, setShowVisualization] = useState(false);

  useEffect(() => {
    if (!tableName || !dbStateManager) {
      setSqlEntry(undefined);
      return;
    }

    // Get the SQL for the current table
    const entry = dbStateManager.getSQLHistory().getTableSQL(tableName);
    setSqlEntry(entry);

    // Subscribe to SQL history changes
    const unsubscribe = dbStateManager.getSQLHistory().subscribe(() => {
      const updatedEntry = dbStateManager.getSQLHistory().getTableSQL(tableName);
      setSqlEntry(updatedEntry);
    });

    return () => {
      unsubscribe();
    };
  }, [tableName, dbStateManager]);

  if (!sqlEntry || !tableName) {
    return null;
  }

  const sourceLabel = {
    'remote-file': 'リモートファイル',
    'ai-chat': 'AIチャット',
    'manual': '手動',
    'unknown': '不明'
  }[sqlEntry.source];

  const timestamp = new Date(sqlEntry.timestamp).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-600">作成元:</span>
          <span className="font-medium text-gray-800">{sourceLabel}</span>
          <span className="text-gray-500">({timestamp})</span>
        </div>
        <button
          onClick={() => setShowVisualization(!showVisualization)}
          className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          {showVisualization ? 'SQLを表示' : '可視化'}
        </button>
      </div>
      
      {!showVisualization ? (
        <pre 
          className="bg-white border border-gray-300 rounded p-2 overflow-y-auto whitespace-pre-wrap break-words text-left"
          style={{ maxHeight: 'calc(1.2em * 5)' }}
        >
          <code className="text-xs text-gray-800 leading-normal text-left">{sqlEntry.sql}</code>
        </pre>
      ) : (
        <div className="bg-white border border-gray-300 rounded" style={{ height: '300px', overflow: 'hidden' }}>
          <SQLFlowVisualization sql={sqlEntry.sql} />
        </div>
      )}
      
      {sqlEntry.explanation && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
          <div className="prose prose-sm max-w-none text-blue-800 text-xs leading-relaxed [&>h1]:text-blue-800 [&>h2]:text-blue-800 [&>h3]:text-blue-800 [&>h4]:text-blue-800 [&>h5]:text-blue-800 [&>h6]:text-blue-800 [&>p]:text-blue-800 [&>li]:text-blue-800 [&>code]:text-blue-800 [&>pre]:bg-blue-50 [&>pre]:border-blue-200">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {sqlEntry.explanation}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
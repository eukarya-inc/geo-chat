import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { SQLHistoryEntry } from '../../lib/duckdb/sqlHistoryManager';
import { SQLFlowVisualization } from './SQLFlowVisualization';
import { useAtomValue } from 'jotai';
import { currentChatStateAtom } from '../../store/derivedAtoms';
import { formatSQL } from '../../utils/sqlFormatter';

interface TableSQLDisplayProps {
    tableName: string | null;
    dbContext: DBContext | null;
    schema?: string | null;
}

interface ColumnSchema {
    column_name: string;
    column_type: string;
    null: string;
}

export default function TableSQLDisplay({ tableName, dbContext, schema }: TableSQLDisplayProps) {
    const [sqlEntry, setSqlEntry] = useState<SQLHistoryEntry | undefined>(undefined);
    const [showVisualization, setShowVisualization] = useState(false);
    const [showMerged, setShowMerged] = useState(false);
    const [tableSchema, setTableSchema] = useState<ColumnSchema[]>([]);

    const chatState = useAtomValue(currentChatStateAtom);
    const mergedSql = useMemo(() => {
        if (!tableName || !chatState?.tables) return undefined;
        const rec = chatState.tables[tableName];
        return rec?.mergedSql || undefined;
    }, [chatState, tableName]);

    const formattedMergedSql = useMemo(() => {
        if (!mergedSql) return undefined;
        return formatSQL(mergedSql);
    }, [mergedSql]);

    useEffect(() => {
        if (!tableName || !dbContext) {
            setSqlEntry(undefined);
            setTableSchema([]);
            return;
        }

        // Get the SQL for the current table
        const entry = dbContext.getSQLHistory().getTableSQL(tableName, schema);
        setSqlEntry(entry);

        // Get table schema
        const fetchSchema = async () => {
            try {
                const schemaData = await dbContext.describeTable(tableName, schema ?? null);
                setTableSchema(schemaData as ColumnSchema[]);
            } catch (error) {
                console.error('Failed to fetch table schema:', error);
                setTableSchema([]);
            }
        };

        fetchSchema();

        // Subscribe to SQL history changes
        const unsubscribe = dbContext.getSQLHistory().subscribe(() => {
            const updatedEntry = dbContext.getSQLHistory().getTableSQL(tableName, schema);
            setSqlEntry(updatedEntry);
        });

        return () => {
            unsubscribe();
        };
    }, [tableName, dbContext, schema]);

    if (!sqlEntry || !tableName) {
        return null;
    }

    const sourceLabel = {
        'remote-file': 'リモートファイル',
        'ai-chat': 'AIチャット',
        manual: '手動',
        unknown: '不明',
    }[sqlEntry.source];

    const timestamp = new Date(sqlEntry.timestamp).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <>
            <div className="flex items-center justify-between mb-2 text-sm">
                <div className="flex items-center gap-2">
                    <span className="text-gray-600">作成元:</span>
                    <span className="font-medium text-gray-800">{sourceLabel}</span>
                    <span className="text-gray-500">({timestamp})</span>
                </div>
                <div className="flex items-center gap-2">
                    {mergedSql && (
                        <button
                            onClick={() => setShowMerged(!showMerged)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${showMerged ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                            title="中間テーブルを含まないマージ済みSQLを表示"
                        >
                            {showMerged ? '通常SQL' : 'マージSQL'}
                        </button>
                    )}
                    <button
                        onClick={() => setShowVisualization(!showVisualization)}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        {showVisualization ? 'SQLを表示' : '可視化'}
                    </button>
                </div>
            </div>

            {!showVisualization ? (
                <pre className="bg-white border border-gray-300 rounded p-2 whitespace-pre-wrap break-words text-left">
                    <code className="text-xs text-gray-800 leading-normal text-left">
                        {showMerged && formattedMergedSql ? formattedMergedSql : sqlEntry.sql}
                    </code>
                </pre>
            ) : (
                <div
                    className="bg-white border border-gray-300 rounded"
                    style={{ height: '300px', overflow: 'hidden' }}
                >
                    <SQLFlowVisualization sql={sqlEntry.sql} />
                </div>
            )}

            {sqlEntry.explanation && (
                <div className="mt-2 prose prose-sm max-w-none text-blue-800 text-xs leading-relaxed [&>h1]:text-blue-800 [&>h2]:text-blue-800 [&>h3]:text-blue-800 [&>h4]:text-blue-800 [&>h5]:text-blue-800 [&>h6]:text-blue-800 [&>p]:text-blue-800 [&>li]:text-blue-800 [&>code]:text-blue-800 [&>pre]:bg-blue-50 [&>pre]:border-blue-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {sqlEntry.explanation}
                    </ReactMarkdown>
                </div>
            )}

            {/* Schema Information */}
            {tableSchema.length > 0 && (
                <div className="mt-3">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">テーブルスキーマ</h4>
                    <div className="bg-white border border-gray-300 rounded p-3">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="text-left py-1.5 px-2 font-semibold text-gray-700">カラム名</th>
                                        <th className="text-left py-1.5 px-2 font-semibold text-gray-700">型</th>
                                        <th className="text-left py-1.5 px-2 font-semibold text-gray-700">NULL許可</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableSchema.map((col, index) => (
                                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="py-1.5 px-2 text-gray-800 font-mono">{col.column_name}</td>
                                            <td className="py-1.5 px-2 text-gray-600 font-mono">{col.column_type}</td>
                                            <td className="py-1.5 px-2 text-gray-600">{col.null}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

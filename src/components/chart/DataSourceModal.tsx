import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ChartSpec, VegaChartSpec } from '../../types/chart';

interface DataSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    chartSpec: ChartSpec;
    onUpdateChart: (newSpec: ChartSpec) => void;
}

type DataSourceType = 'sql' | 'url' | 'inline';

export function DataSourceModal({ isOpen, onClose, chartSpec, onUpdateChart }: DataSourceModalProps) {
    const [dataSourceType, setDataSourceType] = useState<DataSourceType>('sql');
    const [sqlQuery, setSqlQuery] = useState('');
    const [tableName, setTableName] = useState('');
    const [dataUrl, setDataUrl] = useState('');
    const [inlineData, setInlineData] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Initialize form when modal opens
    useEffect(() => {
        if (isOpen && chartSpec?.spec?.data) {
            const data = chartSpec.spec.data as VegaChartSpec['data'];

            // Determine data source type and populate fields
            if (data && 'url' in data && data.url) {
                const url = data.url;
                if (typeof url === 'string' && url.startsWith('duckdb://')) {
                    // Handle duckdb:// URLs - extract table name
                    const path = url.replace('duckdb://', '');
                    const parts = path.split('/');
                    const extractedTableName = parts.length === 2 ? parts[1] : parts[0];
                    setDataSourceType('sql');
                    setTableName(extractedTableName);
                    setSqlQuery(`SELECT * FROM ${extractedTableName}`);
                } else {
                    setDataSourceType('url');
                    setDataUrl(typeof url === 'string' ? url : '');
                }
            } else if (data && 'values' in data && data.values) {
                setDataSourceType('inline');
                setInlineData(JSON.stringify(data.values, null, 2));
            } else {
                // Default to SQL if no data source detected
                setDataSourceType('sql');
                setSqlQuery('');
                setTableName('');
            }

            setError('');
        }
    }, [isOpen, chartSpec]);

    if (!isOpen) return null;

    const handleApply = () => {
        let dataConfig: Record<string, unknown>;

        if (dataSourceType === 'sql') {
            if (!sqlQuery.trim()) {
                setError('SQL query cannot be empty');
                return;
            }

            // Basic SQL validation
            if (!sqlQuery.toLowerCase().includes('select') || !sqlQuery.toLowerCase().includes('from')) {
                setError('SQL query must contain SELECT and FROM clauses');
                return;
            }

            dataConfig = { sql: sqlQuery };
        } else if (dataSourceType === 'url') {
            if (!dataUrl.trim()) {
                setError('URL cannot be empty');
                return;
            }

            // Basic URL validation
            try {
                new URL(dataUrl);
            } catch {
                setError('Please enter a valid URL');
                return;
            }

            dataConfig = { url: dataUrl };
        } else if (dataSourceType === 'inline') {
            if (!inlineData.trim()) {
                setError('Inline data cannot be empty');
                return;
            }

            // Validate JSON
            try {
                const parsedData = JSON.parse(inlineData);
                if (!Array.isArray(parsedData)) {
                    setError('Inline data must be a JSON array');
                    return;
                }
                dataConfig = { values: parsedData };
            } catch {
                setError('Invalid JSON format');
                return;
            }
        } else {
            setError('Please select a data source type');
            return;
        }

        const updatedSpec: ChartSpec = {
            ...chartSpec,
            spec: {
                ...chartSpec.spec,
                data: dataConfig,
            } as unknown as VegaChartSpec,
        };

        onUpdateChart(updatedSpec);
        onClose();
    };

    const handleTableChange = (newTableName: string) => {
        setTableName(newTableName);
        // Update SQL query to use new table name
        if (sqlQuery) {
            const updatedQuery = sqlQuery.replace(/FROM\s+(?:["']?\w+["']?\.)?["']?\w+["']?/i, `FROM ${newTableName}`);
            setSqlQuery(updatedQuery);
        }
    };

    return (
        <div className="fixed inset-0 bg-white bg-opacity-50 flex items-center justify-center z-[2000]">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl max-h-[80vh] w-full mx-4 flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Edit Data Source</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-auto p-6 space-y-4">
                    {/* Data Source Type Tabs */}
                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setDataSourceType('sql')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                dataSourceType === 'sql'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            SQL Query
                        </button>
                        <button
                            onClick={() => setDataSourceType('url')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                dataSourceType === 'url'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            URL
                        </button>
                        <button
                            onClick={() => setDataSourceType('inline')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                dataSourceType === 'inline'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Inline Data
                        </button>
                    </div>

                    {/* SQL Data Source */}
                    {dataSourceType === 'sql' && (
                        <>
                            {/* Table Name Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Table Name</label>
                                <input
                                    type="text"
                                    value={tableName}
                                    onChange={e => handleTableChange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Enter table name"
                                />
                                <p className="mt-1 text-xs text-gray-500">The table to query data from</p>
                            </div>

                            {/* SQL Query Editor */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">SQL Query</label>
                                <textarea
                                    value={sqlQuery}
                                    onChange={e => {
                                        setSqlQuery(e.target.value);
                                        setError('');
                                    }}
                                    className="w-full h-48 px-3 py-2 font-mono text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="SELECT * FROM table_name"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    The SQL query used to fetch data for this chart
                                </p>
                            </div>
                        </>
                    )}

                    {/* URL Data Source */}
                    {dataSourceType === 'url' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Data URL</label>
                            <input
                                type="text"
                                value={dataUrl}
                                onChange={e => {
                                    setDataUrl(e.target.value);
                                    setError('');
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                placeholder="https://example.com/data.json"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                URL to a JSON, CSV, or other data file supported by Vega-Lite
                            </p>
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <p className="text-xs text-blue-800">
                                    <strong>Supported formats:</strong> JSON, CSV, TSV, DSV, TopoJSON
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Inline Data Source */}
                    {dataSourceType === 'inline' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Inline Data (JSON Array)
                            </label>
                            <textarea
                                value={inlineData}
                                onChange={e => {
                                    setInlineData(e.target.value);
                                    setError('');
                                }}
                                className="w-full h-64 px-3 py-2 font-mono text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                placeholder='[{"x": 1, "y": 2}, {"x": 2, "y": 4}]'
                            />
                            <p className="mt-1 text-xs text-gray-500">Enter data as a JSON array of objects</p>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Data Source Info */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-xs text-blue-800">
                            <strong>Note:</strong> Changing the data source may affect the chart visualization. Ensure
                            the new data source has compatible columns for the current chart configuration.
                        </p>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

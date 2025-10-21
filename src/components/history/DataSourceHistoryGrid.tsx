import { useState } from 'react';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import type { Table } from '../../store/remoteAtoms';

export interface DataSourceWithChat extends Table {
    chatId: string;
    chatTitle: string;
}

interface DataSourceHistoryGridProps {
    dataSources: DataSourceWithChat[];
    onSelectDataSource: (chatId: string) => void;
}

type TabType = 'database' | 'remote';

export function DataSourceHistoryGrid({ dataSources, onSelectDataSource }: DataSourceHistoryGridProps) {
    const [activeTab, setActiveTab] = useState<TabType>('database');

    // Filter data sources by type
    const databaseTables = dataSources.filter(ds => ds.source === 'sql' || ds.source === 'ai');
    const remoteFiles = dataSources.filter(ds => ds.source === 'file');

    const currentDataSources = activeTab === 'database' ? databaseTables : remoteFiles;

    return (
        <div className="p-6 h-full overflow-y-auto bg-gray-50">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold mb-4">Data Source List</h1>

                {/* Tabs */}
                <div className="flex border-b border-gray-300">
                    <button
                        onClick={() => setActiveTab('database')}
                        className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'database'
                                ? 'text-gray-900 border-b-2 border-gray-900'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Database tables
                    </button>
                    <button
                        onClick={() => setActiveTab('remote')}
                        className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'remote'
                                ? 'text-gray-900 border-b-2 border-gray-900'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Remote files
                    </button>
                </div>
            </div>

            {/* Grid */}
            {currentDataSources.length === 0 ? (
                <div className="text-center text-gray-500 mt-12">
                    <p>No {activeTab === 'database' ? 'database tables' : 'remote files'} found</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                    {currentDataSources.map(dataSource => (
                        <div
                            key={`${dataSource.chatId}-${dataSource.tableName}`}
                            onClick={() => onSelectDataSource(dataSource.chatId)}
                            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer flex flex-col items-center justify-center"
                        >
                            <div className="w-12 h-12 flex items-center justify-center mb-2">
                                <TableCellsIcon className="w-10 h-10 text-gray-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 text-center truncate w-full">
                                {dataSource.tableName}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 truncate w-full text-center">
                                from: {dataSource.chatTitle}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

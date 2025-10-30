import { useState, useEffect, useCallback } from 'react';
import { TableCard } from './TableCard';
import { MOCK_TABLES, type TableInfo } from './constants';

interface TableSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TableSelectionModal({ isOpen, onClose }: TableSelectionModalProps) {
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());

    // Fetch tables when modal opens (using mock data for now)
    useEffect(() => {
        const fetchTables = async () => {
            if (isOpen) {
                // Use mock data instead of fetching from DB
                setTables(MOCK_TABLES);

                // TODO: Uncomment this when ready to use real data
                // if (dbContext) {
                //     try {
                //         const tableNames = await dbContext.getTables(schema);
                //         setTables(tableNames);
                //     } catch (error) {
                //         console.error('Failed to fetch tables:', error);
                //     }
                // }
            }
        };
        fetchTables();
    }, [isOpen]);

    const toggleTableSelection = useCallback((tableName: string) => {
        setSelectedTables(prev => {
            const newSet = new Set(prev);
            if (newSet.has(tableName)) {
                newSet.delete(tableName);
            } else {
                newSet.add(tableName);
            }
            return newSet;
        });
    }, []);

    const handleAddTables = useCallback(() => {
        // TODO: Implement table selection logic
        // - Send selected tables to parent component
        // - Integrate with chat/AI system
        onClose();
        setSelectedTables(new Set());
    }, [onClose]);

    const handleCancel = useCallback(() => {
        onClose();
        setSelectedTables(new Set());
    }, [onClose]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-white rounded-md overflow-hidden flex flex-col p-6 gap-5 max-w-[90vw] max-h-[90vh]"
                style={{ outline: '1px black solid', outlineOffset: '-1px' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="text-base font-normal" style={{ fontFamily: 'Inter' }}>
                        Add data from LINKS TABLES
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* Tables Grid */}
                <div className="grid grid-cols-3 gap-3 overflow-y-auto content-start max-h-[60vh]">
                    {tables.map(table => (
                        <TableCard
                            key={table.name}
                            tableName={table.name}
                            lastUpdated={table.lastUpdated}
                            isSelected={selectedTables.has(table.name)}
                            onToggle={toggleTableSelection}
                        />
                    ))}
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-between items-start">
                    <button
                        onClick={handleCancel}
                        className="px-2.5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors text-sm font-normal"
                        style={{
                            outline: '1px rgba(0, 0, 0, 0.50) solid',
                            outlineOffset: '-1px',
                            fontFamily: 'Inter',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAddTables}
                        disabled={selectedTables.size === 0}
                        className="px-2.5 py-2.5 rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-normal text-black bg-[#6FE47E]"
                        style={{ fontFamily: 'Inter' }}
                    >
                        Add data
                    </button>
                </div>
            </div>
        </div>
    );
}

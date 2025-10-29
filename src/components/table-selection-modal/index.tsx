import { useState, useEffect } from 'react';

interface TableSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Mock data for testing
const MOCK_TABLES = [
    'customer',
    'orders',
    'products',
    'sales_2023',
    'sales_2024',
    'employees',
    'inventory',
    'suppliers',
    'regions',
];

export function TableSelectionModal({ isOpen, onClose }: TableSelectionModalProps) {
    const [tables, setTables] = useState<string[]>([]);
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

    const toggleTableSelection = (tableName: string) => {
        setSelectedTables(prev => {
            const newSet = new Set(prev);
            if (newSet.has(tableName)) {
                newSet.delete(tableName);
            } else {
                newSet.add(tableName);
            }
            return newSet;
        });
    };

    const handleAddTables = () => {
        // TODO: Implement table selection logic
        // - Send selected tables to parent component
        // - Integrate with chat/AI system
        onClose();
        setSelectedTables(new Set());
    };

    const handleCancel = () => {
        onClose();
        setSelectedTables(new Set());
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={onClose}
        >
            <div
                className="bg-white rounded-md overflow-hidden flex flex-col"
                style={{
                    padding: 24,
                    outline: '1px black solid',
                    outlineOffset: '-1px',
                    gap: 20,
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div style={{ fontFamily: 'Inter', fontWeight: '400', fontSize: 16 }}>
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
                <div
                    className="grid grid-cols-3 gap-3 overflow-y-auto"
                    style={{ alignContent: 'flex-start', maxHeight: '60vh' }}
                >
                    {tables.map(table => {
                        const isSelected = selectedTables.has(table);
                        return (
                            <button
                                key={table}
                                onClick={() => toggleTableSelection(table)}
                                className="flex items-center gap-2 rounded hover:opacity-80 transition-opacity"
                                style={{
                                    width: 220,
                                    padding: 12,
                                    outline: isSelected ? '1px #6FE47E solid' : '1px rgba(0, 0, 0, 0.20) solid',
                                    outlineOffset: '-1px',
                                    background: isSelected ? 'rgba(111, 228, 126, 0.30)' : 'transparent',
                                }}
                            >
                                {/* Table Icon */}
                                <div className="w-6 h-6 relative flex-shrink-0">
                                    <svg
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M3 5.25H21V18C21 18.1989 20.921 18.3897 20.7803 18.5303C20.6397 18.671 20.4489 18.75 20.25 18.75H3.75C3.55109 18.75 3.36032 18.671 3.21967 18.5303C3.07902 18.3897 3 18.1989 3 18V5.25Z"
                                            stroke="black"
                                            strokeOpacity="0.5"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        <path
                                            d="M3 9.75H21"
                                            stroke="black"
                                            strokeOpacity="0.5"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        <path
                                            d="M3 14.25H21"
                                            stroke="black"
                                            strokeOpacity="0.5"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        <path
                                            d="M8.25 9.75V18.75"
                                            stroke="black"
                                            strokeOpacity="0.5"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                                {/* Table Info */}
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                    <div
                                        className="truncate"
                                        style={{
                                            fontFamily: 'Inter',
                                            fontWeight: '400',
                                            fontSize: 14,
                                            color: 'black',
                                        }}
                                    >
                                        {table}
                                    </div>
                                    <div
                                        style={{
                                            fontFamily: 'Inter',
                                            fontWeight: '400',
                                            fontSize: 12,
                                            color: 'rgba(0, 0, 0, 0.60)',
                                        }}
                                    >
                                        last update 1 hour ago
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-between items-start">
                    <button
                        onClick={handleCancel}
                        className="px-2.5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
                        style={{
                            outline: '1px rgba(0, 0, 0, 0.50) solid',
                            outlineOffset: '-1px',
                            fontFamily: 'Inter',
                            fontWeight: '400',
                            fontSize: 14,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAddTables}
                        disabled={selectedTables.size === 0}
                        className="px-2.5 py-2.5 rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: '#6FE47E',
                            fontFamily: 'Inter',
                            fontWeight: '400',
                            fontSize: 14,
                            color: 'black',
                        }}
                    >
                        Add data
                    </button>
                </div>
            </div>
        </div>
    );
}

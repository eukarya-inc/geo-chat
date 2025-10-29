import { useState } from 'react';
import RemoteFile from '../remote-file';
import { TableSelectionModal } from '../table-selection-modal';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface DataSourceSelectorProps {
    dbContext: DBContext | null;
    schema?: string | null;
    onTableCreated?: (tableName: string) => void;
    onSendMessage?: (message: string) => void;
    waitForDbContext?: () => Promise<DBContext>;
    onClose: () => void;
}

export function DataSourceSelector({
    dbContext,
    schema,
    onTableCreated,
    onSendMessage,
    waitForDbContext,
    onClose,
}: DataSourceSelectorProps) {
    const [showTableModal, setShowTableModal] = useState(false);
    const [showLinkInput, setShowLinkInput] = useState(false);

    if (showLinkInput) {
        return (
            <div style={{ minWidth: '400px' }}>
                <RemoteFile
                    dbContext={dbContext}
                    schema={schema}
                    onTableCreated={tableName => {
                        onTableCreated?.(tableName);
                        onClose();
                    }}
                    onSendMessage={onSendMessage}
                    waitForDbContext={waitForDbContext}
                />
            </div>
        );
    }

    return (
        <>
            <div style={{ width: 'fit-content', minWidth: '200px' }}>
                <div
                    className="bg-white p-1 rounded-md flex flex-col gap-1"
                    style={{ outline: '1px rgba(0, 0, 0, 0.20) solid', outlineOffset: '-1px' }}
                >
                    <button
                        onClick={() => setShowTableModal(true)}
                        className="w-full px-2 py-1 rounded text-left text-sm hover:bg-[rgba(111,228,126,0.30)] transition-colors whitespace-nowrap"
                        style={{ fontFamily: 'Inter', fontWeight: '400' }}
                    >
                        Add data from TABLES
                    </button>
                    <button
                        onClick={() => setShowLinkInput(true)}
                        className="w-full px-2 py-1 rounded text-left text-sm hover:bg-[rgba(111,228,126,0.30)] transition-colors whitespace-nowrap"
                        style={{ fontFamily: 'Inter', fontWeight: '400' }}
                    >
                        Add from link
                    </button>
                </div>
            </div>

            <TableSelectionModal
                isOpen={showTableModal}
                onClose={() => {
                    setShowTableModal(false);
                    onClose();
                }}
            />
        </>
    );
}

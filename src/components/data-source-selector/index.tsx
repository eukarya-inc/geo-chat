import { useState } from 'react';
import { TableSelectionModal } from '../table-selection-modal';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { createTableFromUrl } from '../../utils/tableCreation';

interface DataSourceSelectorProps {
    dbContext: DBContext | null;
    schema?: string | null;
    onTableCreated?: (tableName: string) => void;
    onSendMessage?: (message: string) => void;
    waitForDbContext?: () => Promise<DBContext>;
    onClose: () => void;
    onShowUrlGuide?: () => void;
}

export function DataSourceSelector({
    dbContext,
    schema,
    onTableCreated,
    onSendMessage,
    waitForDbContext,
    onClose,
    onShowUrlGuide,
}: DataSourceSelectorProps) {
    const [showTableModal, setShowTableModal] = useState(false);

    const handleLinkClick = () => {
        onClose();
        onShowUrlGuide?.();
    };

    const handleLoadSample = async () => {
        onClose();

        try {
            let db = dbContext;

            if (!db) {
                if (!waitForDbContext) {
                    console.error('データベースが初期化されていません');
                    return;
                }
                db = await waitForDbContext();
            }

            const basePath = import.meta.env.BASE_URL || '/';
            const sampleUrl = `${window.location.origin}${basePath}data/customer.parquet`;

            const { tableName, message } = await createTableFromUrl(sampleUrl, db, schema || null);

            if (onSendMessage) {
                onSendMessage(message);
            }

            onTableCreated?.(tableName);
        } catch (error) {
            console.error('サンプルデータの読み込みに失敗しました:', error);
        }
    };

    return (
        <>
            <div className="py-1">
                <button
                    onClick={() => setShowTableModal(true)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors whitespace-nowrap"
                >
                    テーブルからデータを追加
                </button>
                <button
                    onClick={handleLinkClick}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors whitespace-nowrap"
                >
                    URLからデータを読み込む
                </button>
                <button
                    onClick={handleLoadSample}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors whitespace-nowrap"
                >
                    サンプルデータを読み込む
                </button>
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

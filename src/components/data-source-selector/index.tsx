import { useState } from 'react';
import { TableSelectionModal } from '../table-selection-modal';

interface DataSourceSelectorProps {
    onClose: () => void;
    onShowUrlGuide?: () => void;
    sampleUrl: string;
    onLoadSample: (url: string) => void | Promise<void>;
}

export function DataSourceSelector({ onClose, onShowUrlGuide, sampleUrl, onLoadSample }: DataSourceSelectorProps) {
    const [showTableModal, setShowTableModal] = useState(false);

    const handleLinkClick = () => {
        onClose();
        onShowUrlGuide?.();
    };

    const handleLoadSample = () => {
        console.log('DataSourceSelector handleLoadSample called, sampleUrl:', sampleUrl, 'onLoadSample:', onLoadSample);
        onClose();
        onLoadSample(sampleUrl);
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

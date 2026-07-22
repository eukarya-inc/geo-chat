import { ClipboardDocumentIcon, PlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import VegaLiteChart from '../chart/VegaLiteChart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import { ModalWrapper, type ToolButton } from './ModalWrapper';
import { useCallback, useRef } from 'react';
import type { View } from 'vega';

interface ChartViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    tableName: string;
    chartSpec: VegaChartSpec | undefined;
    dbContext: DBContext | null;
    onExportToDashboard?: () => void;
}

export function ChartViewModal({
    isOpen,
    onClose,
    tableName,
    chartSpec,
    dbContext,
    onExportToDashboard,
}: ChartViewModalProps) {
    const vegaViewRef = useRef<View | null>(null);

    const handleCopyChart = useCallback(async () => {
        if (!vegaViewRef.current) return;

        try {
            const canvas = await vegaViewRef.current.toCanvas();
            canvas.toBlob(async blob => {
                if (blob) {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                }
            });
        } catch (err) {
            console.error('グラフのコピーに失敗:', err);
        }
    }, []);

    const toolButtons: ToolButton[] = [
        {
            icon: <ClipboardDocumentIcon className="w-5 h-5 text-gray-600" />,
            label: '画像としてコピー',
            onClick: handleCopyChart,
            tooltip: 'グラフを画像としてクリップボードにコピー',
            temporaryIcon: <CheckIcon className="w-5 h-5 text-green-600" />,
            temporaryLabel: 'コピーしました',
            temporaryTooltip: 'コピーしました',
        },
    ];

    if (onExportToDashboard) {
        toolButtons.push({
            icon: <PlusIcon className="w-5 h-5 text-gray-600" />,
            label: 'ダッシュボードに書き出す',
            onClick: onExportToDashboard,
            tooltip: 'ダッシュボードにエクスポート',
        });
    }

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={`グラフ: ${tableName}`} toolButtons={toolButtons}>
            {chartSpec && dbContext ? (
                <div className="p-4 w-full h-full overflow-hidden">
                    <VegaLiteChart
                        spec={chartSpec}
                        dbContext={dbContext}
                        showHeader={false}
                        enableActions={false}
                        onViewReady={view => {
                            vegaViewRef.current = view;
                        }}
                    />
                </div>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500">グラフが設定されていません</div>
            )}
        </ModalWrapper>
    );
}

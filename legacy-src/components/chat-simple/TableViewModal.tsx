import { ArrowDownTrayIcon, PlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import { TableView } from '../table/TableView';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { ModalWrapper, type ToolButton } from './ModalWrapper';
import { useCallback } from 'react';

interface TableViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    tableName: string;
    dbContext: DBContext | null;
    schema?: string | null;
    onExportToDashboard?: () => void;
}

export function TableViewModal({
    isOpen,
    onClose,
    tableName,
    dbContext,
    schema,
    onExportToDashboard,
}: TableViewModalProps) {
    const handleDownloadCSV = useCallback(async () => {
        if (!dbContext) return;

        try {
            // Query table data
            const data = await dbContext.executeQuery(`SELECT * FROM "${tableName}"`, schema || null);

            // Convert to CSV format
            if (data.length === 0) {
                return;
            }

            const headers = Object.keys(data[0]);
            const csvRows = data.map(row =>
                headers
                    .map(h => {
                        const value = row[h];
                        // Escape quotes and wrap in quotes if contains comma, quote, or newline
                        const stringValue = String(value ?? '');
                        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        }
                        return stringValue;
                    })
                    .join(',')
            );
            const csv = [headers.join(','), ...csvRows].join('\n');

            // Create blob and download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${tableName}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('CSVのダウンロードに失敗:', err);
        }
    }, [dbContext, tableName, schema]);

    const toolButtons: ToolButton[] = [
        {
            icon: <ArrowDownTrayIcon className="w-5 h-5 text-gray-600" />,
            label: 'CSVとしてダウンロード',
            onClick: handleDownloadCSV,
            tooltip: 'テーブルをCSVファイルとしてダウンロード',
            temporaryIcon: <CheckIcon className="w-5 h-5 text-green-600" />,
            temporaryLabel: 'ダウンロードしました',
            temporaryTooltip: 'ダウンロードしました',
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
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={`テーブル: ${tableName}`} toolButtons={toolButtons}>
            <div className="h-full overflow-hidden">
                {dbContext && <TableView dbContext={dbContext} tableName={tableName} schema={schema} />}
            </div>
        </ModalWrapper>
    );
}

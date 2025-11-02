import { ArrowDownTrayIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { DropdownMenu, type DropdownMenuItem } from '../common/DropdownMenu';

interface TableDropdownMenuProps {
    tableName: string;
    dbContext: DBContext;
    chatId?: string | null;
    onExport?: () => void;
    showExportButton?: boolean;
    isExportDisabled?: boolean;
    onRemove?: () => void;
    showRemoveButton?: boolean;
}

export function TableDropdownMenu({
    tableName,
    dbContext,
    chatId,
    onExport,
    showExportButton = false,
    isExportDisabled = false,
    onRemove,
    showRemoveButton = false,
}: TableDropdownMenuProps) {
    const handleDownload = async (format: 'parquet' | 'csv' | 'json') => {
        try {
            // Use the downloadTable method from DBContext
            const blob = await dbContext.downloadTable(tableName, format, chatId);

            // Determine file extension
            const extension = format === 'parquet' ? 'parquet' : format === 'csv' ? 'csv' : 'json';

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${tableName}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(`Failed to download table as ${format}:`, error);
            alert('テーブルのダウンロードに失敗しました');
        }
    };

    const menuItems: DropdownMenuItem[] = [
        {
            title: 'CSV形式でダウンロード',
            icon: <ArrowDownTrayIcon className="w-4 h-4" />,
            onClick: () => handleDownload('csv'),
        },
        {
            title: 'JSON形式でダウンロード',
            icon: <ArrowDownTrayIcon className="w-4 h-4" />,
            onClick: () => handleDownload('json'),
        },
        {
            title: 'Parquet形式でダウンロード',
            icon: <ArrowDownTrayIcon className="w-4 h-4" />,
            onClick: () => handleDownload('parquet'),
        },
        ...(showExportButton && onExport
            ? [
                  {
                      title: 'ダッシュボードにエクスポート',
                      icon: <ArrowUpTrayIcon className="w-4 h-4" />,
                      onClick: onExport,
                      disabled: isExportDisabled,
                      divider: 'before' as const,
                  } as DropdownMenuItem,
              ]
            : []),
        ...(showRemoveButton && onRemove
            ? [
                  {
                      title: 'テーブルを削除',
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: onRemove,
                      variant: 'danger' as const,
                      divider: 'before' as const,
                  } as DropdownMenuItem,
              ]
            : []),
    ];

    return <DropdownMenu title="テーブルオプション" items={menuItems} menuWidth="w-64" />;
}

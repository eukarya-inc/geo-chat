import {
    ClipboardDocumentIcon,
    ArrowUpTrayIcon,
    PaintBrushIcon,
    CogIcon,
    CheckIcon,
} from '@heroicons/react/24/outline';
import type { ToolButton } from './VisualizationHeader';

interface CopyButtonProps {
    onCopy: () => void;
    title?: string;
}

export function createCopyButton({ onCopy, title }: CopyButtonProps): ToolButton {
    return {
        icon: <ClipboardDocumentIcon className="w-5 h-5" />,
        onClick: onCopy,
        title: title || 'クリップボードにコピー',
        // Temporary feedback after copy
        temporaryIcon: <CheckIcon className="w-5 h-5 text-green-500" />,
        temporaryTitle: 'コピーしました！',
        temporaryDuration: 1500,
    };
}

interface ExportButtonProps {
    onExport: () => void;
    disabled?: boolean;
    tooltip?: string;
}

export function createExportButton({ onExport, disabled = false, tooltip }: ExportButtonProps): ToolButton {
    return {
        icon: <ArrowUpTrayIcon className="w-5 h-5" />,
        onClick: onExport,
        title: tooltip || 'ダッシュボードにエクスポート',
        disabled,
        className: `transition-colors p-2 rounded ${
            disabled
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:text-gray-600 cursor-pointer hover:bg-gray-100'
        }`,
        // Temporary feedback after export
        temporaryIcon: <CheckIcon className="w-5 h-5 text-green-500" />,
        temporaryTitle: 'エクスポートしました！',
        temporaryDuration: 1500,
    };
}

interface StyleEditorButtonProps {
    onOpenStyleEditor: () => void;
    type: 'map' | 'chart';
}

export function createStyleEditorButton({ onOpenStyleEditor, type }: StyleEditorButtonProps): ToolButton {
    return {
        icon: type === 'map' ? <PaintBrushIcon className="w-5 h-5" /> : <CogIcon className="w-5 h-5" />,
        onClick: onOpenStyleEditor,
        title: type === 'map' ? '地図スタイルを編集' : 'グラフスタイルを編集',
    };
}

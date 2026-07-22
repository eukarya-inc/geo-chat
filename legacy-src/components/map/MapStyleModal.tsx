import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MapStyleManager } from './mapStyleManager';

interface MapStyleModalProps {
    isOpen: boolean;
    onClose: () => void;
    styleManager: MapStyleManager | null;
    onStyleChange?: (style: maplibregl.StyleSpecification) => void;
}

export function MapStyleModal({ isOpen, onClose, styleManager, onStyleChange }: MapStyleModalProps) {
    const [jsonText, setJsonText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    // Initialize JSON text when modal opens
    useEffect(() => {
        if (isOpen && styleManager) {
            try {
                const currentStyle = styleManager.getCurrentStyle();
                setJsonText(JSON.stringify(currentStyle, null, 2));
                setError(null);
                setHasChanges(false);
            } catch (err) {
                console.error('Failed to load current style:', err);
                setError('スタイルの読み込みに失敗しました');
            }
        }
    }, [isOpen, styleManager]);

    const handleJsonChange = (newText: string) => {
        setJsonText(newText);
        setHasChanges(true);

        // Try to parse and validate
        try {
            const parsed = JSON.parse(newText);
            if (!parsed.version || !parsed.layers || !parsed.sources) {
                setError('必須プロパティ（version, layers, sources）が不足しています');
            } else {
                setError(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '無効なJSON');
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(jsonText);
        alert('JSONをクリップボードにコピーしました！');
    };

    const handleApply = async () => {
        if (!styleManager) {
            setError('Style managerが利用できません');
            return;
        }

        setIsApplying(true);
        setError(null);

        try {
            const parsedStyle = JSON.parse(jsonText) as maplibregl.StyleSpecification;

            if (!parsedStyle.version || !parsedStyle.layers || !parsedStyle.sources) {
                throw new Error('必須プロパティ（version, layers, sources）が不足しています');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const map = (styleManager as any).map;
            if (!map) {
                throw new Error('StyleManagerにmap参照がありません');
            }

            if (!map.loaded() || !map.isStyleLoaded()) {
                throw new Error('マップの準備ができていません');
            }

            map.setStyle(parsedStyle);
            setHasChanges(false);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '不明なエラー';
            setError(`スタイルの適用に失敗しました: ${errorMessage}`);
        } finally {
            setIsApplying(false);
        }
    };

    const handleReset = () => {
        if (styleManager) {
            try {
                const currentStyle = styleManager.getCurrentStyle();
                setJsonText(JSON.stringify(currentStyle, null, 2));
                setError(null);
                setHasChanges(false);
            } catch (err) {
                console.error('Failed to reset style:', err);
                setError('リセットに失敗しました');
            }
        }
    };

    const handleResetToDefault = async () => {
        if (!onStyleChange) return;

        setIsApplying(true);
        try {
            const defaultStyle = {
                version: 8,
                glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
                sources: {
                    osm: {
                        type: 'raster',
                        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        maxzoom: 19,
                        tileSize: 256,
                        attribution:
                            '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    },
                },
                layers: [
                    {
                        id: 'osm-layer',
                        source: 'osm',
                        type: 'raster',
                    },
                ],
            } as maplibregl.StyleSpecification;

            await onStyleChange(defaultStyle);
            setJsonText(JSON.stringify(defaultStyle, null, 2));
            setHasChanges(false);
            setError(null);
        } catch {
            setError('デフォルトスタイルへのリセットに失敗しました');
        } finally {
            setIsApplying(false);
        }
    };

    const handleFormatJson = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setJsonText(JSON.stringify(parsed, null, 2));
            setError(null);
        } catch {
            setError('無効なJSON形式です');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const target = e.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const newText = jsonText.substring(0, start) + '  ' + jsonText.substring(end);
            setJsonText(newText);
            setHasChanges(true);
            // Set cursor position after the inserted spaces
            setTimeout(() => {
                target.selectionStart = target.selectionEnd = start + 2;
            }, 0);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">マップスタイル</h3>
                        {hasChanges && <p className="text-xs text-orange-600 mt-1">未保存の変更があります</p>}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    <textarea
                        value={jsonText}
                        onChange={e => handleJsonChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        className={`w-full h-full font-mono text-sm p-4 rounded-lg border resize-none ${
                            error
                                ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500'
                                : 'border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500'
                        }`}
                        style={{ minHeight: '400px' }}
                        spellCheck={false}
                        readOnly={false}
                    />
                    {error && (
                        <div className="mt-2 p-3 bg-red-100 border border-red-300 rounded-lg">
                            <p className="text-sm text-red-800 font-medium">検証エラー:</p>
                            <p className="text-xs text-red-700 mt-1">{error}</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center gap-3">
                        {hasChanges && (
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                リセット
                            </button>
                        )}
                        <button
                            onClick={handleFormatJson}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            フォーマット
                        </button>
                        <button
                            onClick={handleResetToDefault}
                            disabled={isApplying}
                            className={`px-4 py-2 rounded-lg transition-colors ${
                                isApplying
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                        >
                            デフォルトに戻す
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCopy}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            JSONをコピー
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!!error || !hasChanges || isApplying}
                            className={`px-4 py-2 rounded-lg transition-colors ${
                                error || !hasChanges || isApplying
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {isApplying ? '適用中...' : '変更を適用'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}

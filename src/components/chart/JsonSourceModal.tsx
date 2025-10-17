import { useState, useEffect } from 'react';
import type { VegaChartSpec } from '../../types/chart';
import type { View } from 'vega';

interface JsonSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    chartSpec: VegaChartSpec;
    vegaView?: View | null;
    onApply?: (newSpec: VegaChartSpec) => void;
}

export function JsonSourceModal({ isOpen, onClose, chartSpec, vegaView, onApply }: JsonSourceModalProps) {
    const [jsonText, setJsonText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // Initialize JSON text when modal opens or chartSpec changes
    useEffect(() => {
        if (isOpen) {
            // If we have a Vega View, get the final spec with data from it
            if (vegaView) {
                try {
                    const dataValues = vegaView.data('source_0') || [];
                    const specWithData = {
                        ...chartSpec,
                        data: { values: dataValues },
                    };
                    setJsonText(JSON.stringify(specWithData, null, 2));
                } catch (err) {
                    console.error('Error getting data from Vega View:', err);
                    setJsonText(JSON.stringify(chartSpec, null, 2));
                }
            } else {
                setJsonText(JSON.stringify(chartSpec, null, 2));
            }
            setError(null);
            setHasChanges(false);
        }
    }, [isOpen, chartSpec, vegaView]);

    const handleJsonChange = (newText: string) => {
        setJsonText(newText);
        setHasChanges(true);

        // Try to parse and validate
        try {
            JSON.parse(newText);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON');
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(jsonText);
        alert('JSON copied to clipboard!');
    };

    const handleApply = () => {
        try {
            const parsedSpec = JSON.parse(jsonText);
            if (onApply) {
                onApply(parsedSpec);
                setHasChanges(false);
                alert('Changes applied successfully!');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON');
        }
    };

    const handleReset = () => {
        setJsonText(JSON.stringify(chartSpec, null, 2));
        setError(null);
        setHasChanges(false);
    };

    const handleOpenInVegaEditor = () => {
        try {
            const spec = JSON.parse(jsonText);
            // Remove the data.sql property and keep data.values for Vega Editor
            const editorSpec = {
                ...spec,
                data: spec.data && 'values' in spec.data ? { values: spec.data.values } : spec.data,
            };
            const specString = JSON.stringify(editorSpec);
            const encodedSpec = encodeURIComponent(specString);
            const vegaEditorUrl = `https://vega.github.io/editor/#/url/vega-lite/${encodedSpec}`;
            window.open(vegaEditorUrl, '_blank');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">JSON Source</h3>
                        {hasChanges && <p className="text-xs text-orange-600 mt-1">You have unsaved changes</p>}
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
                            <p className="text-sm text-red-800 font-medium">Validation Error:</p>
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
                                Reset
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleOpenInVegaEditor}
                            disabled={!!error}
                            className={`px-4 py-2 rounded-lg transition-colors ${
                                error
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                            title="Open this specification in the Vega Editor"
                        >
                            Open in Vega Editor
                        </button>
                        <button
                            onClick={handleCopy}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Copy JSON
                        </button>
                        {onApply && (
                            <button
                                onClick={handleApply}
                                disabled={!!error || !hasChanges}
                                className={`px-4 py-2 rounded-lg transition-colors ${
                                    error || !hasChanges
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                            >
                                Apply Changes
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

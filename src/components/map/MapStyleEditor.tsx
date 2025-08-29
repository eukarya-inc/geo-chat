import React, { useState, useEffect } from 'react';
import type { MapStyleManager } from './mapStyleManager';

interface MapStyleEditorProps {
    styleManager: MapStyleManager | null;
    onStyleChange?: (style: maplibregl.StyleSpecification) => void;
    onClose?: () => void;
}

const MapStyleEditor: React.FC<MapStyleEditorProps> = ({ styleManager, onStyleChange, onClose }) => {
    const [isOpen, setIsOpen] = useState(true);  // Default to open when component is rendered
    const [styleJson, setStyleJson] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isApplying, setIsApplying] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isManuallyEdited, setIsManuallyEdited] = useState(false);

    // Load current style when editor opens or styleManager changes (but not if manually edited)
    useEffect(() => {
        if (styleManager && isOpen && !isManuallyEdited) {
            try {
                const currentStyle = styleManager.getCurrentStyle();
                setStyleJson(JSON.stringify(currentStyle, null, 2));
                setError('');
            } catch (error) {
                console.error('Failed to load current style:', error);
                setError('Failed to load current map style');
            }
        }
    }, [styleManager, isOpen, isManuallyEdited]);

    const handleApplyStyle = async () => {
        if (!styleManager) {
            setError('Style manager not available');
            return;
        }

        setIsApplying(true);
        setError('');

        try {
            // Parse JSON to validate it
            const parsedStyle = JSON.parse(styleJson) as maplibregl.StyleSpecification;
            
            // Validate required properties
            if (!parsedStyle.version || !parsedStyle.layers || !parsedStyle.sources) {
                throw new Error('Invalid style: missing required properties (version, layers, sources)');
            }

            // Apply the style directly to the map through styleManager
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const map = (styleManager as any).map;
            if (!map) {
                throw new Error('StyleManager has no map reference');
            }
            
            if (!map.loaded() || !map.isStyleLoaded()) {
                throw new Error('Map not ready for style changes');
            }

            // Apply the new style directly to the map
            map.setStyle(parsedStyle);
            
            setIsManuallyEdited(true);
            setError('');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(`Failed to apply style: ${errorMessage}`);
        } finally {
            setIsApplying(false);
        }
    };

    const handleReset = () => {
        if (styleManager) {
            try {
                const currentStyle = styleManager.getCurrentStyle();
                setStyleJson(JSON.stringify(currentStyle, null, 2));
                setError('');
                setIsManuallyEdited(false);
            } catch (error) {
                console.error('Failed to reset to current style:', error);
                setError('Failed to reset to current style');
            }
        }
    };

    const handleFormatJson = () => {
        try {
            const parsed = JSON.parse(styleJson);
            setStyleJson(JSON.stringify(parsed, null, 2));
            setError('');
        } catch {
            setError('Invalid JSON format');
        }
    };

    if (!isOpen) {
        return null;  // Don't render anything when closed, control is handled by parent
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: isExpanded ? '5vh' : '10px',
                right: isExpanded ? '5vw' : '10px',
                left: isExpanded ? '5vw' : 'auto',
                width: isExpanded ? '90vw' : '500px',
                height: isExpanded ? '90vh' : '60vh',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'all 0.3s ease'
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #ddd',
                    backgroundColor: '#f8f9fa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}
            >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                    Map Style Editor {isManuallyEdited && <span style={{ color: '#ff6600', fontSize: '12px' }}>(Modified)</span>}
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '16px',
                            cursor: 'pointer',
                            color: '#666',
                            padding: '4px'
                        }}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isExpanded ? '⊟' : '⊞'}
                    </button>
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            onClose?.();
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '18px',
                            cursor: 'pointer',
                            color: '#666',
                            padding: '0 4px'
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #ddd',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                    gap: '8px'
                }}
            >
                <button
                    onClick={handleApplyStyle}
                    disabled={isApplying || !styleManager}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: isApplying ? '#ccc' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isApplying ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        minHeight: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {isApplying ? 'Applying...' : 'Apply Style'}
                </button>
                <button
                    onClick={handleReset}
                    disabled={!styleManager}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        minHeight: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    Reset
                </button>
                <button
                    onClick={handleFormatJson}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        minHeight: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    Format JSON
                </button>
                <button
                    onClick={async () => {
                        if (onStyleChange) {
                            // Create default style
                            const defaultStyle = {
                                version: 8,
                                glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
                                sources: {
                                    osm: {
                                        type: 'raster',
                                        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                                        maxzoom: 19,
                                        tileSize: 256,
                                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
                            
                            setIsApplying(true);
                            try {
                                await onStyleChange(defaultStyle);
                                setStyleJson(JSON.stringify(defaultStyle, null, 2));
                                setIsManuallyEdited(false);
                                setError('');
                            } catch {
                                setError('Failed to reset to default style');
                            } finally {
                                setIsApplying(false);
                            }
                        }
                    }}
                    disabled={isApplying}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: isApplying ? '#ccc' : '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isApplying ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        minHeight: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    Reset to Default
                </button>
            </div>

            {/* Error Display */}
            {error && (
                <div
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        borderBottom: '1px solid #ddd',
                        fontSize: '12px'
                    }}
                >
                    {error}
                </div>
            )}


            {/* JSON Editor */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <textarea
                    value={styleJson}
                    onChange={(e) => setStyleJson(e.target.value)}
                    placeholder="Map style JSON will appear here..."
                    style={{
                        flex: 1,
                        padding: '12px',
                        border: 'none',
                        outline: 'none',
                        fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                        fontSize: isExpanded ? '13px' : '12px',
                        lineHeight: '1.5',
                        resize: 'none',
                        backgroundColor: '#2d3748',
                        color: '#e2e8f0',
                        borderRadius: '0'
                    }}
                />
            </div>

            {/* Help Text */}
            <div
                style={{
                    padding: '8px 16px',
                    borderTop: '1px solid #ddd',
                    backgroundColor: '#f8f9fa',
                    fontSize: '11px',
                    color: '#666'
                }}
            >
                Edit the MapLibre GL style JSON above. Click "Apply Style" to update the map.
                Note: Applying a new style will replace the current map completely.
            </div>
        </div>
    );
};

export default MapStyleEditor;
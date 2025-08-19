import { useState, useEffect, useCallback } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { StyleSpecification } from 'maplibre-gl';
import { checkTableGeometry } from '../../../utils/duckdbGeometryHelpers';
import type { TableStyle, ExtraStyle } from '../../../components/map';
import type { Chat } from '../../../components/chat/ChatList';

interface MapViewState {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
}

export function useMapVisualization(
    selectedTable: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null,
    selectedChatId: string | null,
    updateChatState: (updates: Partial<Chat>) => void
) {
    const [mapSelectedColumns, setMapSelectedColumns] = useState<string[]>([]);
    const [selectedGeometryColumn, setSelectedGeometryColumn] = useState<string>('geometry');
    const [tableStyles, setTableStyles] = useState<Record<string, TableStyle>>({});
    const [extraMapStyle, setExtraMapStyle] = useState<ExtraStyle | undefined>(undefined);

    // Check for geom column and available columns when table is selected
    useEffect(() => {
        const checkGeomColumn = async () => {
            if (!selectedTable || !connection) {
                return;
            }

            const result = await checkTableGeometry(connection, selectedTable);

            if (result.geometryColumns.length > 0) {
                setSelectedGeometryColumn(result.geometryColumns[0]);
                setMapSelectedColumns(result.nonGeometryColumns);
            }
        };

        checkGeomColumn();
    }, [selectedTable, connection]);

    // Update table styles in chat
    const updateTableStyle = useCallback((tableName: string, style: TableStyle) => {
        // Update local state
        setTableStyles(prev => ({
            ...prev,
            [tableName]: style
        }));
        
        // Save to chat
        if (selectedChatId) {
            updateChatState({
                tableStyles: {
                    ...tableStyles,
                    [tableName]: style
                }
            });
        }
    }, [selectedChatId, tableStyles, updateChatState]);

    // Update extra map style in chat
    const updateExtraMapStyle = useCallback((style: ExtraStyle | undefined) => {
        // Update local state
        setExtraMapStyle(style);
        
        // Save to chat
        if (selectedChatId) {
            updateChatState({ extraMapStyle: style });
        }
    }, [selectedChatId, updateChatState]);

    // Update map view state in chat
    const updateMapViewState = useCallback((viewState: MapViewState) => {
        // Save map state to chat
        if (selectedChatId) {
            updateChatState({
                mapState: {
                    center: viewState.center,
                    zoom: viewState.zoom,
                    bearing: viewState.bearing,
                    pitch: viewState.pitch
                }
            });
        }
    }, [selectedChatId, updateChatState]);

    // Update map style in chat
    const updateMapStyle = useCallback((style: StyleSpecification) => {
        // Save style to chat
        if (selectedChatId) {
            updateChatState({
                mapState: {
                    style
                }
            });
        }
    }, [selectedChatId, updateChatState]);

    return {
        mapSelectedColumns,
        selectedGeometryColumn,
        tableStyles,
        extraMapStyle,
        updateTableStyle,
        updateExtraMapStyle,
        updateMapViewState,
        updateMapStyle,
    };
}
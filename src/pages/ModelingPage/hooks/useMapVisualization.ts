import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { checkTableGeometry } from '../../../utils/duckdbGeometryHelpers';
import type { TableStyle } from '../../../components/map';
import { updateChatStateAtom, currentChatStateAtom } from '../../../store/modelingAtoms';


export function useMapVisualization(
    selectedTable: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null
) {
    const [mapSelectedColumns, setMapSelectedColumns] = useState<string[]>([]);
    const [selectedGeometryColumn, setSelectedGeometryColumn] = useState<string>('geometry');
    const currentChatState = useAtomValue(currentChatStateAtom);
    const updateChatStateAtomSet = useSetAtom(updateChatStateAtom);

    // Get current table's map spec
    const currentMapSpec = selectedTable ? currentChatState?.mapSpecs?.[selectedTable] : undefined;
    
    // Memoize tableStyles and style to prevent unnecessary re-renders
    const tableStyles = useMemo(() => {
        return currentMapSpec?.tableStyles || {};
    }, [currentMapSpec?.tableStyles]);
    
    const mapStyle = useMemo(() => {
        return currentMapSpec?.style;
    }, [currentMapSpec?.style]);

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

    // Update table styles for current table
    const updateTableStyle = useCallback((tableName: string, style: TableStyle) => {
        if (!selectedTable) return;
        
        const currentSpecs = currentChatState?.mapSpecs || {};
        const currentSpec = currentSpecs[selectedTable] || {};
        
        updateChatStateAtomSet({
            mapSpecs: {
                ...currentSpecs,
                [selectedTable]: {
                    ...currentSpec,
                    tableStyles: {
                        ...(currentSpec.tableStyles || {}),
                        [tableName]: style
                    }
                }
            }
        });
    }, [selectedTable, currentChatState?.mapSpecs, updateChatStateAtomSet]);



    return {
        mapSelectedColumns,
        selectedGeometryColumn,
        tableStyles,
        mapStyle,
        updateTableStyle,
    };
}
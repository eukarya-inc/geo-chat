import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { checkTableGeometry } from '../../../utils/duckdb';
import type { TableStyle } from '../../../components/map';
import { updateChatStateAtom, currentChatStateAtom } from '../../../store/atoms';
import type { DBContext } from '../../../lib/duckdb/dbContext';

export function useMapVisualization(selectedTable: string | null, db: DBContext | null, schema: string | null = null) {
    const [mapSelectedColumns, setMapSelectedColumns] = useState<string[]>([]);
    const [selectedGeometryColumn, setSelectedGeometryColumn] = useState<string | undefined>(undefined);
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
            if (!selectedTable || !db) {
                setSelectedGeometryColumn(undefined);
                return;
            }

            const result = await checkTableGeometry(db, selectedTable, schema);

            if (result.geometryColumns.length > 0) {
                setSelectedGeometryColumn(result.geometryColumns[0]);
                setMapSelectedColumns(result.nonGeometryColumns);
            } else {
                setSelectedGeometryColumn(undefined);
            }
        };

        checkGeomColumn();
    }, [selectedTable, db, schema]);

    // Update table styles for current table
    const updateTableStyle = useCallback(
        (tableName: string, style: TableStyle) => {
            if (!tableName) {
                console.warn('No table name provided for style update');
                return;
            }

            const currentSpecs = currentChatState?.mapSpecs || {};

            // The tableName passed here should be the table we're updating styles for
            // We need to ensure the mapSpec exists for this table
            const currentSpec = currentSpecs[tableName] || {};

            // Update the mapSpec for the specific table
            const updatedMapSpecs = {
                ...currentSpecs,
                [tableName]: {
                    ...currentSpec,
                    tableStyles: {
                        ...(currentSpec.tableStyles || {}),
                        [tableName]: style, // The table's own styles are stored under its name
                    },
                },
            };

            updateChatStateAtomSet({
                mapSpecs: updatedMapSpecs,
            });
        },
        [currentChatState?.mapSpecs, updateChatStateAtomSet]
    );

    // Delete table styles for a dropped table
    const deleteTableStyle = useCallback(
        (tableName: string) => {
            if (!tableName) {
                console.warn('No table name provided for style deletion');
                return;
            }

            const currentSpecs = currentChatState?.mapSpecs || {};

            // Remove the mapSpec for the dropped table
            const updatedMapSpecs = { ...currentSpecs };
            delete updatedMapSpecs[tableName];

            updateChatStateAtomSet({
                mapSpecs: updatedMapSpecs,
            });

            console.log(`[Map Visualization] Deleted map spec for table: ${tableName}`);
        },
        [currentChatState?.mapSpecs, updateChatStateAtomSet]
    );

    return {
        mapSelectedColumns,
        selectedGeometryColumn,
        tableStyles,
        mapStyle,
        updateTableStyle,
        deleteTableStyle,
    };
}

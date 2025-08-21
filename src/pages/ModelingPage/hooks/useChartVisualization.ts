import { useState, useEffect, useRef, useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { generateDefaultCharts } from '../../../utils/autoChartGenerator';
import type { ChartSpec } from '../../../types/chart';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import {
    toggleTableGraphAtom,
    updateChatStateAtom,
    currentChatAtom,
    currentChatStateAtom,
    currentTableShowGraphAtom
} from '../../../store/modelingAtoms';

export function useChartVisualization(
    selectedTable: string | null,
    dbContext: DBContext | null,
    schemaName: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null
) {
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);
    const toggleTableGraph = useSetAtom(toggleTableGraphAtom);
    const updateChatState = useSetAtom(updateChatStateAtom);
    const currentChat = useAtomValue(currentChatAtom);
    const currentChatState = useAtomValue(currentChatStateAtom);
    const showGraph = useAtomValue(currentTableShowGraphAtom);
    const lastUpdatedTableRef = useRef<string | null>(null);

    // Clear chart spec immediately when schema changes or table is cleared
    useEffect(() => {
        setChartSpec(null);
    }, [schemaName]);

    // Clear chart spec when selectedTable becomes null
    useEffect(() => {
        if (selectedTable === null) {
            setChartSpec(null);
        }
    }, [selectedTable]);

    // Update chart spec in remote state when it changes
    const updateChartSpecInState = useCallback((table: string, spec: ChartSpec) => {
        if (currentChat?.type === 'graph' && lastUpdatedTableRef.current !== table) {
            lastUpdatedTableRef.current = table;
            updateChatState({
                chartSpecs: {
                    ...(currentChatState?.chartSpecs || {}),
                    [table]: {
                        id: spec.id,
                        spec: spec.spec,
                        timestamp: spec.timestamp
                    }
                }
            });
        }
    }, [currentChat?.type, currentChatState?.chartSpecs, updateChatState]);

    // Generate preview chart when table is selected and connection is ready
    useEffect(() => {
        const generateChart = async () => {
            if (!selectedTable || !dbContext || !connection || !schemaName) {
                setChartSpec(null);
                lastUpdatedTableRef.current = null;
                return;
            }

            // Check if we already have a chart spec for this table
            const existingSpec = currentChatState?.chartSpecs?.[selectedTable];
            if (existingSpec) {
                setChartSpec({
                    id: existingSpec.id,
                    spec: existingSpec.spec, // Type from storage
                    timestamp: existingSpec.timestamp,
                    title: `Chart for ${selectedTable}`
                });
                return;
            }

            // Add a small delay to ensure schema is fully switched
            await new Promise(resolve => setTimeout(resolve, 100));

            // First validate that the table exists in this schema
            try {
                const isValid = await dbContext.validateTable(selectedTable, schemaName);
                if (!isValid) {
                    // Table doesn't exist in this schema, clear chart spec silently
                    setChartSpec(null);
                    return;
                }
            } catch {
                // Validation failed, clear chart spec silently
                setChartSpec(null);
                return;
            }

            try {
                const defaultCharts = await generateDefaultCharts(selectedTable, dbContext, schemaName);

                if (defaultCharts.length > 0) {
                    const result = defaultCharts[0];
                    const newChartSpec: ChartSpec = {
                        id: `preview-${selectedTable}-${schemaName}`,
                        spec: result.spec,
                        timestamp: new Date(),
                        title: result.title
                    };
                    setChartSpec(newChartSpec);

                    // Update chartSpecs in remote state only if it's a new chart
                    updateChartSpecInState(selectedTable, newChartSpec);
                } else {
                    setChartSpec(null);
                }
            } catch (error) {
                console.error('Error generating preview chart:', error);
                setChartSpec(null);
            }
        };

        generateChart();
    }, [selectedTable, dbContext, schemaName, connection, currentChatState?.chartSpecs, updateChartSpecInState]);

    // Function to toggle graph visibility for current table
    const toggleGraphVisibility = () => {
        if (selectedTable) {
            toggleTableGraph(selectedTable);
        }
    };

    return {
        chartSpec,
        showGraph,
        toggleGraphVisibility,
    };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { generateDefaultCharts } from '../../../utils/autoChartGenerator';
import type { ChartSpec, VegaChartSpec } from '../../../types/chart';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import {
    updateChatStateAtom,
    currentChatAtom,
    currentChatStateAtom,
    currentTableShowGraphAtom
} from '../../../store/atoms';

export function useChartVisualization(
    selectedTable: string | null,
    dbContext: DBContext | null,
    schemaName: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null
) {
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);
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
        if (currentChat && lastUpdatedTableRef.current !== table) {
            lastUpdatedTableRef.current = table;
            updateChatState({
                chartSpecs: {
                    ...(currentChatState?.chartSpecs || {}),
                    [table]: {
                        id: spec.id,
                        spec: spec.spec,
                        timestamp: spec.timestamp,
                        title: spec.title
                    }
                }
            });
        }
    }, [currentChat, currentChatState?.chartSpecs, updateChatState]);

    // Load existing chart spec or clear when table changes
    useEffect(() => {
        if (!selectedTable) {
            setChartSpec(null);
            lastUpdatedTableRef.current = null;
            return;
        }

        // Check if we already have a chart spec for this table
        const existingSpec = currentChatState?.chartSpecs?.[selectedTable];
        if (existingSpec) {
            setChartSpec({
                id: existingSpec.id,
                spec: existingSpec.spec,
                timestamp: existingSpec.timestamp,
                title: existingSpec.title || `Chart for ${selectedTable}`
            });
        } else {
            // Don't generate chart automatically, wait for user to turn on graph
            setChartSpec(null);
        }
    }, [selectedTable, currentChatState?.chartSpecs]);

    // Generate chart automatically when table is selected
    useEffect(() => {
        const generateChartIfNeeded = async () => {
            // Only generate if table is selected, connection exists, and no chart exists
            if (!selectedTable || !dbContext || !connection || !schemaName) {
                return;
            }

            // Check if we already have a chart spec for this table
            const existingSpec = currentChatState?.chartSpecs?.[selectedTable];
            if (existingSpec) {
                return; // Already have a chart
            }

            // Add a small delay to ensure schema is fully switched
            await new Promise(resolve => setTimeout(resolve, 100));

            // First validate that the table exists in this schema
            try {
                const isValid = await dbContext.validateTable(selectedTable, schemaName);
                if (!isValid) {
                    // Table doesn't exist in this schema
                    return;
                }
            } catch {
                // Validation failed
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

                    // Update chartSpecs in remote state
                    updateChartSpecInState(selectedTable, newChartSpec);
                }
            } catch (error) {
                console.error('Error generating preview chart:', error);
            }
        };

        generateChartIfNeeded();
    }, [selectedTable, dbContext, schemaName, connection, currentChatState?.chartSpecs, updateChartSpecInState]);

    // Function to toggle graph visibility for current table
    // Note: Not needed anymore since visibility is determined by chartSpec existence
    const toggleGraphVisibility = () => {
        console.warn('toggleGraphVisibility is deprecated - visibility is determined by chartSpec existence');
    };

    // Function to update chart spec from AI tool
    const updateChartFromAI = useCallback(async (tableName: string, spec: VegaChartSpec) => {
        if (!dbContext || !schemaName) {
            throw new Error('Database context or schema not available');
        }

        // Validate that the table exists
        const isValid = await dbContext.validateTable(tableName, schemaName);
        if (!isValid) {
            throw new Error(`Table "${tableName}" does not exist in schema "${schemaName}"`);
        }

        // Create new chart spec
        const newChartSpec: ChartSpec = {
            id: `ai-chart-${tableName}-${Date.now()}`,
            spec: spec,
            timestamp: new Date(),
            title: typeof spec.title === 'string' ? spec.title : (typeof spec.title === 'object' && spec.title && 'text' in spec.title ? String(spec.title.text) : undefined) || `Chart for ${tableName}`
        };

        // Update local state if this is the currently selected table
        if (tableName === selectedTable) {
            setChartSpec(newChartSpec);
        }

        // Update remote state
        updateChatState({
            chartSpecs: {
                ...(currentChatState?.chartSpecs || {}),
                [tableName]: {
                    id: newChartSpec.id,
                    spec: newChartSpec.spec,
                    timestamp: newChartSpec.timestamp,
                    title: newChartSpec.title
                }
            }
        });

        // Graph display is automatically turned on when chartSpec exists
    }, [dbContext, schemaName, selectedTable, currentChatState, updateChatState]);

    // Function to delete chart spec from AI tool
    const deleteChartFromAI = useCallback(async (tableName: string) => {
        if (!dbContext || !schemaName) {
            throw new Error('Database context or schema not available');
        }

        // Clear local state if this is the currently selected table
        if (tableName === selectedTable) {
            setChartSpec(null);
        }

        // Update remote state to remove the chart spec
        const updatedChartSpecs = { ...(currentChatState?.chartSpecs || {}) };
        delete updatedChartSpecs[tableName];
        
        updateChatState({
            chartSpecs: updatedChartSpecs
        });

        // Graph display is automatically turned off when chartSpec is deleted
    }, [dbContext, schemaName, selectedTable, currentChatState, updateChatState]);

    return {
        chartSpec,
        showGraph,
        toggleGraphVisibility,
        updateChartFromAI,
        deleteChartFromAI,
    };
}

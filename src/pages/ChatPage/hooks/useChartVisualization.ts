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
    currentTableShowGraphAtom,
} from '../../../store/atoms';

export function useChartVisualization(
    selectedTable: string | null,
    dbContext: DBContext | null,
    schemaName: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null,
    activeTab?: string
) {
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);
    const updateChatState = useSetAtom(updateChatStateAtom);
    const currentChat = useAtomValue(currentChatAtom);
    const currentChatState = useAtomValue(currentChatStateAtom);
    const showGraph = useAtomValue(currentTableShowGraphAtom);
    const lastUpdatedTableRef = useRef<string | null>(null);
    const chartGenerationAttemptedRef = useRef<Set<string>>(new Set());
    const chartUserDeletedRef = useRef<Set<string>>(new Set()); // Track tables where user deleted chart

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
    const updateChartSpecInState = useCallback(
        (table: string, spec: ChartSpec) => {
            if (currentChat && lastUpdatedTableRef.current !== table) {
                lastUpdatedTableRef.current = table;
                updateChatState({
                    chartSpecs: {
                        ...(currentChatState?.chartSpecs || {}),
                        [table]: {
                            id: spec.id,
                            spec: spec.spec,
                            timestamp: spec.timestamp,
                            title: spec.title,
                        },
                    },
                });
            }
        },
        [currentChat, currentChatState?.chartSpecs, updateChatState]
    );

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
                title: existingSpec.title || `Chart for ${selectedTable}`,
            });
        } else {
            // Don't generate chart automatically, wait for user to click chart tab
            setChartSpec(null);
        }
    }, [selectedTable, currentChatState?.chartSpecs]);

    // Generate chart automatically when chart tab is clicked for the first time
    useEffect(() => {
        const generateChartOnTabClick = async () => {
            // Only generate if:
            // 1. Chart tab is active
            // 2. Table is selected
            // 3. No chart exists yet for this table
            // 4. Haven't already attempted generation for this table
            // 5. User hasn't deleted a chart for this table before
            if (activeTab !== 'chart' || !selectedTable || !dbContext || !connection || !schemaName) {
                return;
            }

            // Check if we already have a chart spec for this table
            const existingSpec = currentChatState?.chartSpecs?.[selectedTable];
            if (existingSpec) {
                return; // Already have a chart
            }

            // Check if we've already attempted to generate for this table
            const attemptKey = `${schemaName}-${selectedTable}`;
            if (chartGenerationAttemptedRef.current.has(attemptKey)) {
                return; // Already attempted
            }

            // Check if user has deleted a chart for this table before
            // If so, don't auto-generate, let them choose via AI
            if (chartUserDeletedRef.current.has(attemptKey)) {
                return; // User deleted chart before, show chart type selector
            }

            // Mark as attempted
            chartGenerationAttemptedRef.current.add(attemptKey);

            // Add a small delay to ensure schema is fully switched
            await new Promise(resolve => setTimeout(resolve, 100));

            // Validate that the table exists in this schema
            try {
                const isValid = await dbContext.validateTable(selectedTable, schemaName);
                if (!isValid) {
                    return;
                }
            } catch {
                return;
            }

            try {
                const defaultCharts = await generateDefaultCharts(selectedTable, dbContext, schemaName);

                if (defaultCharts.length > 0) {
                    const result = defaultCharts[0];
                    const newChartSpec: ChartSpec = {
                        id: `auto-${selectedTable}-${schemaName}-${Date.now()}`,
                        spec: result.spec,
                        timestamp: new Date(),
                        title: result.title,
                    };
                    setChartSpec(newChartSpec);

                    // Update chartSpecs in remote state
                    updateChartSpecInState(selectedTable, newChartSpec);
                }
            } catch (error) {
                console.error('Error generating chart on tab click:', error);
            }
        };

        generateChartOnTabClick();
    }, [
        activeTab,
        selectedTable,
        dbContext,
        schemaName,
        connection,
        currentChatState?.chartSpecs,
        updateChartSpecInState,
    ]);

    // Generate chart when graph is turned on for the first time
    useEffect(() => {
        const generateChartIfNeeded = async () => {
            // Only generate if graph is shown, table is selected, and no chart exists
            if (!showGraph || !selectedTable || !dbContext || !connection || !schemaName) {
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
                        title: result.title,
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
    }, [
        showGraph,
        selectedTable,
        dbContext,
        schemaName,
        connection,
        currentChatState?.chartSpecs,
        updateChartSpecInState,
    ]);

    // Function to toggle graph visibility for current table
    // Note: Not needed anymore since visibility is determined by chartSpec existence
    const toggleGraphVisibility = () => {
        console.warn('toggleGraphVisibility is deprecated - visibility is determined by chartSpec existence');
    };

    // Function to update chart spec from AI tool
    const updateChartFromAI = useCallback(
        async (tableName: string, spec: VegaChartSpec) => {
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
                title:
                    typeof spec.title === 'string'
                        ? spec.title
                        : (typeof spec.title === 'object' && spec.title && 'text' in spec.title
                              ? String(spec.title.text)
                              : undefined) || `Chart for ${tableName}`,
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
                        title: newChartSpec.title,
                    },
                },
            });

            // Graph display is automatically turned on when chartSpec exists
        },
        [dbContext, schemaName, selectedTable, currentChatState, updateChatState]
    );

    // Function to delete chart spec from AI tool
    const deleteChartFromAI = useCallback(
        async (tableName: string) => {
            if (!dbContext || !schemaName) {
                throw new Error('Database context or schema not available');
            }

            // Clear local state if this is the currently selected table
            if (tableName === selectedTable) {
                setChartSpec(null);
            }

            // Mark this table as user-deleted so auto-generation won't happen again
            // This ensures user sees chart type selector after deletion
            const attemptKey = `${schemaName}-${tableName}`;
            chartUserDeletedRef.current.add(attemptKey);

            // Update remote state to remove the chart spec
            const updatedChartSpecs = { ...(currentChatState?.chartSpecs || {}) };
            delete updatedChartSpecs[tableName];

            updateChatState({
                chartSpecs: updatedChartSpecs,
            });

            // Graph display is automatically turned off when chartSpec is deleted
        },
        [dbContext, schemaName, selectedTable, currentChatState, updateChatState]
    );

    return {
        chartSpec,
        showGraph,
        toggleGraphVisibility,
        updateChartFromAI,
        deleteChartFromAI,
    };
}

import { useCallback, useMemo } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import type { ChartSpec, VegaChartSpec } from '../../../types/chart';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import { updateChatStateAtom, currentChatStateAtom, currentTableShowGraphAtom } from '../../../store/atoms';

export function useChartVisualization(
    selectedTable: string | null,
    dbContext: DBContext | null,
    schemaName: string | null
) {
    const updateChatState = useSetAtom(updateChatStateAtom);
    const currentChatState = useAtomValue(currentChatStateAtom);
    const showGraph = useAtomValue(currentTableShowGraphAtom);

    // Derive chartSpec from remote state - single source of truth
    const chartSpec = useMemo<ChartSpec | null>(() => {
        if (!selectedTable) return null;

        // Get chart spec from remote state
        const existingSpec = currentChatState?.chartSpecs?.[selectedTable];
        if (!existingSpec) {
            return null;
        }

        return {
            id: existingSpec.id,
            spec: existingSpec.spec,
            timestamp: existingSpec.timestamp,
            title: existingSpec.title || `Chart for ${selectedTable}`,
            aiGeneratedSpec: existingSpec.aiGeneratedSpec,
        };
    }, [selectedTable, currentChatState?.chartSpecs]);

    // Update chart spec from AI tool
    const updateChartFromAI = useCallback(
        async (tableName: string, spec: VegaChartSpec) => {
            if (!dbContext || !schemaName) {
                throw new Error('Database context or schema not available');
            }

            // Validate table exists
            const isValid = await dbContext.validateTable(tableName, schemaName);
            if (!isValid) {
                throw new Error(`Table "${tableName}" does not exist in schema "${schemaName}"`);
            }

            // Get existing chart spec to preserve aiGeneratedSpec
            const existingSpec = currentChatState?.chartSpecs?.[tableName];

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
                aiGeneratedSpec: existingSpec?.aiGeneratedSpec || spec,
            };

            // Update remote state
            updateChatState({
                chartSpecs: {
                    [tableName]: newChartSpec,
                },
            });
        },
        [dbContext, schemaName, currentChatState, updateChatState]
    );

    // Delete chart spec from AI tool
    const deleteChartFromAI = useCallback(
        async (tableName: string) => {
            if (!dbContext || !schemaName) {
                throw new Error('Database context or schema not available');
            }

            // Update remote state with null to indicate deletion
            // The atom merger will handle removing the entry
            updateChatState({
                chartSpecs: {
                    [tableName]: null,
                },
            });
        },
        [dbContext, schemaName, updateChatState]
    );

    // Deprecated function kept for backward compatibility
    const toggleGraphVisibility = () => {
        console.warn('toggleGraphVisibility is deprecated - visibility is determined by chartSpec existence');
    };

    return {
        chartSpec,
        showGraph,
        toggleGraphVisibility,
        updateChartFromAI,
        deleteChartFromAI,
    };
}

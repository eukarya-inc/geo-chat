import { useState, useEffect } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { generateDefaultCharts } from '../../../utils/autoChartGenerator';
import type { ChartSpec } from '../../../types/chart';
import type { DBContext } from '../../../lib/duckdb/dbContext';

export function useChartVisualization(
    selectedTable: string | null,
    dbContext: DBContext | null,
    schemaName: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null,
    connectionTimestamp: number
) {
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);

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

    // Generate preview chart when table is selected and connection is ready
    useEffect(() => {
        const generateChart = async () => {
            if (!selectedTable || !dbContext || !connection || !schemaName) {
                setChartSpec(null);
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
            } catch (error) {
                // Validation failed, clear chart spec silently
                setChartSpec(null);
                return;
            }

            try {
                const defaultCharts = await generateDefaultCharts(selectedTable, dbContext, schemaName);

                if (defaultCharts.length > 0) {
                    const result = defaultCharts[0];
                    setChartSpec({
                        id: `preview-${selectedTable}-${schemaName}-${connectionTimestamp}`,
                        spec: result.spec,
                        timestamp: new Date(),
                        title: result.title
                    });
                } else {
                    setChartSpec(null);
                }
            } catch (error) {
                console.error('Error generating preview chart:', error);
                setChartSpec(null);
            }
        };

        generateChart();
    }, [selectedTable, dbContext, schemaName, connection, connectionTimestamp]);

    return {
        chartSpec,
    };
}
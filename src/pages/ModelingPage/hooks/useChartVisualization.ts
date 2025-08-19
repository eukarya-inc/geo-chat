import { useState, useEffect } from 'react';
import { generateDefaultCharts } from '../../../utils/autoChartGenerator';
import type { ChartSpec } from '../../../types/chart';
import type { DBContext } from '../../../lib/duckdb/dbContext';

export function useChartVisualization(
    selectedTable: string | null,
    dbContext: DBContext | null,
    selectedChatId: string | null
) {
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);

    // Generate preview chart when table is selected
    useEffect(() => {
        const generateChart = async () => {
            if (!selectedTable || !dbContext) {
                setChartSpec(null);
                return;
            }

            try {
                const defaultCharts = await generateDefaultCharts(selectedTable, dbContext, selectedChatId);

                if (defaultCharts.length > 0) {
                    const result = defaultCharts[0];
                    setChartSpec({
                        id: `preview-${selectedTable}`,
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
    }, [selectedTable, dbContext, selectedChatId]);

    return {
        chartSpec,
    };
}
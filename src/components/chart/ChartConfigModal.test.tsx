import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChartConfigModal } from './ChartConfigModal';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';

// Mock the ChartConfigForm component since we test it separately
vi.mock('./ChartConfigForm', () => ({
    ChartConfigForm: ({
        onConfigChange,
    }: {
        onConfigChange: (config: { title: string; tableName: string; chartType: string }, columns: unknown[]) => void;
    }) => {
        const mockConfig = {
            title: 'Test Chart',
            tableName: 'test_table',
            chartType: 'circle',
        };
        const mockColumns: unknown[] = [];

        return (
            <div data-testid="chart-config-form">
                <button onClick={() => onConfigChange(mockConfig, mockColumns)}>Update Spec</button>
            </div>
        );
    },
}));

describe('ChartConfigModal', () => {
    const mockDBContext: Partial<DBContext> = {
        getTableColumns: vi.fn().mockResolvedValue([]),
    };

    const mockChartSpec: ChartSpec = {
        id: 'test-chart',
        title: 'Test Chart',
        spec: {
            mark: 'circle',
            encoding: {},
            data: { values: [] },
        },
        timestamp: new Date(),
    };

    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        chartSpec: mockChartSpec,
        dbContext: mockDBContext as DBContext,
        schema: 'test_schema',
        onUpdateChart: vi.fn(),
        vizId: 'test-viz-id',
    };

    it('should not render when isOpen is false', () => {
        render(<ChartConfigModal {...defaultProps} isOpen={false} />);

        expect(screen.queryByText('Chart Configuration')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
        render(<ChartConfigModal {...defaultProps} />);

        expect(screen.getByText('Chart Configuration')).toBeInTheDocument();
        expect(screen.getByText('Close')).toBeInTheDocument();
    });

    it('should render the chart config form', () => {
        render(<ChartConfigModal {...defaultProps} />);

        expect(screen.getByTestId('chart-config-form')).toBeInTheDocument();
    });

    it('should auto-apply changes when spec is updated', () => {
        render(<ChartConfigModal {...defaultProps} />);

        const updateButton = screen.getByText('Update Spec');
        updateButton.click();

        // Verify onUpdateChart was called with the correct parameters
        // Note: The id is preserved from the original chartSpec, not from the config
        expect(defaultProps.onUpdateChart).toHaveBeenCalledWith(
            'test-viz-id',
            expect.objectContaining({
                id: 'test-chart',
                title: 'Test Chart',
            })
        );
    });
});

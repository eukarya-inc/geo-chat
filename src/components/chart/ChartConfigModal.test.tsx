import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChartConfigModal } from './ChartConfigModal';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';

// Mock the ChartConfigForm component since we test it separately
vi.mock('./ChartConfigForm', () => ({
  ChartConfigForm: ({ onSpecChange }: { onSpecChange: (spec: ChartSpec) => void }) => {
    const mockSpec: ChartSpec = {
      id: 'test-id',
      title: 'Test Chart',
      spec: {
        mark: 'circle',
        encoding: {},
        data: { values: [] }
      },
      timestamp: new Date()
    };

    return (
      <div data-testid="chart-config-form">
        <button onClick={() => onSpecChange(mockSpec)}>Update Spec</button>
      </div>
    );
  }
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
      data: { values: [] }
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
    vizId: 'test-viz-id'
  };

  it('should not render when isOpen is false', () => {
    render(<ChartConfigModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Chart Configuration')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(<ChartConfigModal {...defaultProps} />);

    expect(screen.getByText('Chart Configuration')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(screen.getByText('Apply Changes')).toBeInTheDocument();
  });

  it('should render the chart config form', () => {
    render(<ChartConfigModal {...defaultProps} />);

    expect(screen.getByTestId('chart-config-form')).toBeInTheDocument();
  });

  it('should have Apply Changes button disabled initially', () => {
    render(<ChartConfigModal {...defaultProps} />);

    const applyButton = screen.getByText('Apply Changes');
    expect(applyButton).toBeDisabled();
  });
});

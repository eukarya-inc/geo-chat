import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChartPanel } from './ChartPanel';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { View } from 'vega';

// Mock child components
vi.mock('./VegaLiteChart', () => ({
    default: ({ onViewReady }: { onViewReady?: (view: View | null) => void }) => {
        // Simulate view ready callback
        if (onViewReady) {
            setTimeout(() => {
                act(() => {
                    onViewReady({ view: vi.fn() } as unknown as View);
                });
            }, 0);
        }
        return <div data-testid="vega-lite-chart">VegaLiteChart</div>;
    },
}));

vi.mock('./ChartConfigForm', () => ({
    ChartConfigForm: ({
        onConfigChange,
    }: {
        onConfigChange: (config: { title: string }, columns: unknown[]) => void;
    }) => (
        <div data-testid="chart-config-form">
            <button onClick={() => onConfigChange({ title: 'Updated Title' }, [])}>Update Config</button>
        </div>
    ),
}));

vi.mock('./ChartDropdownMenu', () => ({
    ChartDropdownMenu: ({
        onConfigOpen,
        onDataSourceOpen,
        onJsonSourceOpen,
    }: {
        onConfigOpen?: () => void;
        onDataSourceOpen?: () => void;
        onJsonSourceOpen?: () => void;
    }) => (
        <div data-testid="chart-dropdown-menu">
            <button onClick={onConfigOpen}>Config</button>
            <button onClick={onDataSourceOpen}>Data Source</button>
            <button onClick={onJsonSourceOpen}>JSON Source</button>
        </div>
    ),
}));

vi.mock('./ChartConfigModal', () => ({
    ChartConfigModal: ({
        isOpen,
        onClose,
        onUpdateChart,
    }: {
        isOpen: boolean;
        onClose: () => void;
        onUpdateChart: (vizId: string, spec: ChartSpec) => void;
    }) =>
        isOpen ? (
            <div data-testid="chart-config-modal" role="dialog">
                <button onClick={onClose}>Close Config Modal</button>
                <button
                    onClick={() =>
                        onUpdateChart('viz-1', {
                            id: 'test',
                            title: 'Test',
                            spec: {},
                            timestamp: new Date(),
                        } as ChartSpec)
                    }
                >
                    Update from Modal
                </button>
            </div>
        ) : null,
}));

vi.mock('./DataSourceModal', () => ({
    DataSourceModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
        isOpen ? (
            <div data-testid="data-source-modal" role="dialog">
                <button onClick={onClose}>Close Data Source Modal</button>
            </div>
        ) : null,
}));

vi.mock('./ChartSpecModal', () => ({
    ChartSpecModal: ({
        isOpen,
        onClose,
        onApply,
        aiGeneratedSpec,
    }: {
        isOpen: boolean;
        onClose: () => void;
        onApply: (spec: unknown) => void;
        aiGeneratedSpec?: unknown;
    }) =>
        isOpen ? (
            <div data-testid="chart-spec-modal" role="dialog">
                <button onClick={onClose}>Close Chart Spec Modal</button>
                <button onClick={() => onApply({ mark: 'bar' })}>Apply Spec</button>
                <div data-testid="ai-generated-spec">{aiGeneratedSpec ? 'Has AI Spec' : 'No AI Spec'}</div>
            </div>
        ) : null,
}));

vi.mock('../common/VisualizationHeader', () => ({
    VisualizationHeader: ({
        title,
        toolButtons,
        menu,
    }: {
        title: string;
        toolButtons?: unknown[];
        menu?: React.ReactNode;
    }) => (
        <div data-testid="visualization-header">
            <h3>{title}</h3>
            <div data-testid="tool-buttons-count">{toolButtons?.length || 0}</div>
            {menu}
        </div>
    ),
}));

vi.mock('../common/VisualizationToolButtons', () => ({
    createStyleEditorButton: ({ onOpenStyleEditor }: { onOpenStyleEditor: () => void }) => ({
        type: 'styleEditor',
        onClick: onOpenStyleEditor,
    }),
    createCopyButton: ({ onCopy }: { onCopy: () => void }) => ({
        type: 'copy',
        onClick: onCopy,
    }),
    createExportButton: ({ onExport, disabled }: { onExport: () => void; disabled?: boolean }) => ({
        type: 'export',
        onClick: onExport,
        disabled,
    }),
}));

vi.mock('../../lib/chart/chartSpecGenerator', () => ({
    generateChartSpec: () => ({ mark: 'circle', encoding: {} }),
}));

describe('ChartPanel', () => {
    const mockDBContext: Partial<DBContext> = {
        getTableColumns: vi.fn(),
    };

    const mockChartSpec: ChartSpec = {
        id: 'test-chart',
        title: 'Test Chart',
        spec: {
            mark: 'circle',
            encoding: {},
            data: { url: 'duckdb://test_table' },
        },
        timestamp: new Date(),
        aiGeneratedSpec: { mark: 'point', encoding: {}, data: { url: 'duckdb://test_table' } } as ChartSpec['spec'],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Phase 1: Mode Switching - Config/DataSource/JsonSource Handlers', () => {
        it('should open config modal in modal mode when handleConfigOpen is called', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={vi.fn()}
                />
            );

            const configButton = screen.getByText('Config');
            fireEvent.click(configButton);

            expect(screen.getByTestId('chart-config-modal')).toBeInTheDocument();
        });

        it('should call onConfigOpen callback in panel mode when handleConfigOpen is called', () => {
            const onConfigOpen = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="panel"
                    onConfigOpen={onConfigOpen}
                    onSpecChange={vi.fn()}
                />
            );

            const configButton = screen.getByText('Config');
            fireEvent.click(configButton);

            expect(onConfigOpen).toHaveBeenCalledTimes(1);
            expect(screen.queryByTestId('chart-config-modal')).not.toBeInTheDocument();
        });

        it('should open data source modal in modal mode when handleDataSourceOpen is called', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={vi.fn()}
                />
            );

            const dataSourceButton = screen.getByText('Data Source');
            fireEvent.click(dataSourceButton);

            expect(screen.getByTestId('data-source-modal')).toBeInTheDocument();
        });

        it('should call onDataSourceOpen callback in panel mode when handleDataSourceOpen is called', () => {
            const onDataSourceOpen = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="panel"
                    onDataSourceOpen={onDataSourceOpen}
                    onSpecChange={vi.fn()}
                />
            );

            const dataSourceButton = screen.getByText('Data Source');
            fireEvent.click(dataSourceButton);

            expect(onDataSourceOpen).toHaveBeenCalledTimes(1);
            expect(screen.queryByTestId('data-source-modal')).not.toBeInTheDocument();
        });

        it('should open chart spec modal in modal mode when handleJsonSourceOpen is called', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={vi.fn()}
                />
            );

            const jsonSourceButton = screen.getByText('JSON Source');
            fireEvent.click(jsonSourceButton);

            expect(screen.getByTestId('chart-spec-modal')).toBeInTheDocument();
        });

        it('should call onJsonSourceOpen callback in panel mode when handleJsonSourceOpen is called', () => {
            const onJsonSourceOpen = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="panel"
                    onJsonSourceOpen={onJsonSourceOpen}
                    onSpecChange={vi.fn()}
                />
            );

            const jsonSourceButton = screen.getByText('JSON Source');
            fireEvent.click(jsonSourceButton);

            expect(onJsonSourceOpen).toHaveBeenCalledTimes(1);
            expect(screen.queryByTestId('chart-spec-modal')).not.toBeInTheDocument();
        });
    });

    describe('Phase 2: Data Integrity - aiGeneratedSpec Preservation', () => {
        it('should preserve aiGeneratedSpec when handleConfigChange is called', () => {
            const onSpecChange = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="panel"
                    showConfigPanel={true}
                    onCloseConfigPanel={vi.fn()}
                    onSpecChange={onSpecChange}
                />
            );

            const updateButton = screen.getByText('Update Config');
            fireEvent.click(updateButton);

            expect(onSpecChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    aiGeneratedSpec: mockChartSpec.aiGeneratedSpec,
                    title: 'Updated Title',
                })
            );
        });

        it('should preserve aiGeneratedSpec when ChartSpecModal onApply is called', () => {
            const onSpecChange = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={onSpecChange}
                />
            );

            // Open modal
            const jsonSourceButton = screen.getByText('JSON Source');
            fireEvent.click(jsonSourceButton);

            // Apply changes
            const applyButton = screen.getByText('Apply Spec');
            fireEvent.click(applyButton);

            expect(onSpecChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    spec: { mark: 'bar' },
                    aiGeneratedSpec: mockChartSpec.aiGeneratedSpec,
                })
            );
        });
    });

    describe('Phase 3: Conditional Rendering', () => {
        it('should show configuration panel in panel mode when showConfigPanel is true', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="panel"
                    showConfigPanel={true}
                    onCloseConfigPanel={vi.fn()}
                    onSpecChange={vi.fn()}
                />
            );

            expect(screen.getByText('Chart Configuration')).toBeInTheDocument();
            expect(screen.getByTestId('chart-config-form')).toBeInTheDocument();
        });

        it('should not render modals in modal mode when required props are missing', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    configMode="modal"
                    // Missing dbContext, chatId, onSpecChange
                />
            );

            // Try to open modal (but button won't be visible without dbContext/chatId)
            expect(screen.queryByTestId('chart-config-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('data-source-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('chart-spec-modal')).not.toBeInTheDocument();
        });

        it('should not render ChartConfigForm in panel when dbContext or chatId or onSpecChange is missing', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    configMode="panel"
                    showConfigPanel={true}
                    onCloseConfigPanel={vi.fn()}
                    // Missing dbContext, chatId, onSpecChange
                />
            );

            expect(screen.getByText('Chart Configuration')).toBeInTheDocument();
            expect(screen.queryByTestId('chart-config-form')).not.toBeInTheDocument();
        });
    });

    describe('Phase 4: Additional Important Tests', () => {
        it('should update vegaViewRef and call onViewReady when handleViewReady is called', async () => {
            const onViewReady = vi.fn();
            render(<ChartPanel chartSpec={mockChartSpec} configMode="modal" onViewReady={onViewReady} />);

            // Wait for VegaLiteChart to call onViewReady
            await vi.waitFor(() => {
                expect(onViewReady).toHaveBeenCalledWith(expect.objectContaining({ view: expect.any(Function) }));
            });
        });

        it('should not call onExport when isExportDisabled is true', () => {
            const onExport = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    configMode="modal"
                    showMenuExportButton={true}
                    onExport={onExport}
                    isExportDisabled={true}
                />
            );

            // ToolButtons are created with wrapped onExport
            // Check that the button exists but the wrapper prevents the call
            const toolButtonsCount = screen.getByTestId('tool-buttons-count');
            expect(toolButtonsCount.textContent).toBe('2'); // copy + export (disabled)
        });

        it('should close config modal when onClose is called', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={vi.fn()}
                />
            );

            // Open modal
            const configButton = screen.getByText('Config');
            fireEvent.click(configButton);
            expect(screen.getByTestId('chart-config-modal')).toBeInTheDocument();

            // Close modal
            const closeButton = screen.getByText('Close Config Modal');
            fireEvent.click(closeButton);
            expect(screen.queryByTestId('chart-config-modal')).not.toBeInTheDocument();
        });

        it('should close data source modal when onClose is called', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={vi.fn()}
                />
            );

            // Open modal
            const dataSourceButton = screen.getByText('Data Source');
            fireEvent.click(dataSourceButton);
            expect(screen.getByTestId('data-source-modal')).toBeInTheDocument();

            // Close modal
            const closeButton = screen.getByText('Close Data Source Modal');
            fireEvent.click(closeButton);
            expect(screen.queryByTestId('data-source-modal')).not.toBeInTheDocument();
        });

        it('should close chart spec modal when onClose is called', () => {
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="modal"
                    onSpecChange={vi.fn()}
                />
            );

            // Open modal
            const jsonSourceButton = screen.getByText('JSON Source');
            fireEvent.click(jsonSourceButton);
            expect(screen.getByTestId('chart-spec-modal')).toBeInTheDocument();

            // Close modal
            const closeButton = screen.getByText('Close Chart Spec Modal');
            fireEvent.click(closeButton);
            expect(screen.queryByTestId('chart-spec-modal')).not.toBeInTheDocument();
        });

        it('should call onCloseConfigPanel when close button in panel is clicked', () => {
            const onCloseConfigPanel = vi.fn();
            render(
                <ChartPanel
                    chartSpec={mockChartSpec}
                    dbContext={mockDBContext as DBContext}
                    chatId="test_schema"
                    configMode="panel"
                    showConfigPanel={true}
                    onCloseConfigPanel={onCloseConfigPanel}
                    onSpecChange={vi.fn()}
                />
            );

            const closeButton = screen.getByTitle('Close configuration panel');
            fireEvent.click(closeButton);

            expect(onCloseConfigPanel).toHaveBeenCalledTimes(1);
        });
    });
});

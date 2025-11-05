import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChartDropdownMenu } from './ChartDropdownMenu';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { View } from 'vega';

// Mock DropdownMenu to render items as buttons
vi.mock('../common/DropdownMenu', () => ({
    DropdownMenu: ({ items }: { items: Array<{ title: string; onClick: () => void; disabled?: boolean }> }) => (
        <div data-testid="dropdown-menu">
            {items.map((item, index) => (
                <button key={index} onClick={item.onClick} disabled={item.disabled}>
                    {item.title}
                </button>
            ))}
        </div>
    ),
}));

describe('ChartDropdownMenu', () => {
    const mockChartSpec: ChartSpec = {
        id: 'test-chart',
        title: 'Test Chart',
        spec: {
            mark: 'circle',
            encoding: {},
            data: { url: 'duckdb://test_table' },
        },
        timestamp: new Date(),
    };

    const mockVegaView = {
        toSVG: vi.fn().mockResolvedValue('<svg></svg>'),
    } as unknown as View;

    const mockDBContext = {} as DBContext;

    let defaultProps: {
        chartSpec: ChartSpec;
        vegaView?: View | null;
        dbContext?: DBContext;
        chatId?: string;
        onConfigOpen?: ReturnType<typeof vi.fn>;
        onDataSourceOpen?: ReturnType<typeof vi.fn>;
        onJsonSourceOpen?: ReturnType<typeof vi.fn>;
        onRemove?: ReturnType<typeof vi.fn>;
        onExport?: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        defaultProps = {
            chartSpec: mockChartSpec,
            vegaView: mockVegaView,
            dbContext: mockDBContext,
            chatId: 'test_schema',
            onConfigOpen: vi.fn(),
            onDataSourceOpen: vi.fn(),
            onJsonSourceOpen: vi.fn(),
            onRemove: vi.fn(),
            onExport: vi.fn(),
        };
        vi.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        it('should render DropdownMenu', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
        });
    });

    describe('Always Visible Menu Items', () => {
        it('should always show "クリップボードにコピー"', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('クリップボードにコピー')).toBeInTheDocument();
        });

        it('should always show "PNGとして保存"', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('PNGとして保存')).toBeInTheDocument();
        });

        it('should always show "SVGとして保存"', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('SVGとして保存')).toBeInTheDocument();
        });
    });

    describe('Conditional Menu Items - Visibility', () => {
        it('should show "グラフスタイルを編集" when dbContext, chatId, and onConfigOpen are provided', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('グラフスタイルを編集')).toBeInTheDocument();
        });

        it('should show "データソースを編集" when onDataSourceOpen is provided', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('データソースを編集')).toBeInTheDocument();
        });

        it('should show "グラフ仕様を表示" when onJsonSourceOpen is provided', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('グラフ仕様を表示')).toBeInTheDocument();
        });

        it('should show "ダッシュボードにエクスポート" when onExport is provided', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('ダッシュボードにエクスポート')).toBeInTheDocument();
        });

        it('should show "グラフを削除" when onRemove is provided', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            expect(screen.getByText('グラフを削除')).toBeInTheDocument();
        });
    });

    describe('Conditional Menu Items - Hidden', () => {
        it('should not show "グラフスタイルを編集" when dbContext is missing', () => {
            render(<ChartDropdownMenu {...defaultProps} dbContext={undefined} />);

            expect(screen.queryByText('グラフスタイルを編集')).not.toBeInTheDocument();
        });

        it('should not show "グラフを削除" when onRemove is not provided', () => {
            render(<ChartDropdownMenu {...defaultProps} onRemove={undefined} />);

            expect(screen.queryByText('グラフを削除')).not.toBeInTheDocument();
        });
    });

    describe('Disabled State', () => {
        it('should disable "ダッシュボードにエクスポート" when isExportDisabled is true', () => {
            render(<ChartDropdownMenu {...defaultProps} isExportDisabled={true} />);

            const exportButton = screen.getByText('ダッシュボードにエクスポート');
            expect(exportButton).toBeDisabled();
        });
    });

    describe('Menu Item Callbacks', () => {
        it('should call onConfigOpen when "グラフスタイルを編集" is clicked', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            const button = screen.getByText('グラフスタイルを編集');
            fireEvent.click(button);

            expect(defaultProps.onConfigOpen).toHaveBeenCalledTimes(1);
        });

        it('should call onDataSourceOpen when "データソースを編集" is clicked', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            const button = screen.getByText('データソースを編集');
            fireEvent.click(button);

            expect(defaultProps.onDataSourceOpen).toHaveBeenCalledTimes(1);
        });

        it('should call onJsonSourceOpen when "グラフ仕様を表示" is clicked', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            const button = screen.getByText('グラフ仕様を表示');
            fireEvent.click(button);

            expect(defaultProps.onJsonSourceOpen).toHaveBeenCalledTimes(1);
        });

        it('should call onExport when "ダッシュボードにエクスポート" is clicked', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            const button = screen.getByText('ダッシュボードにエクスポート');
            fireEvent.click(button);

            expect(defaultProps.onExport).toHaveBeenCalledTimes(1);
        });

        it('should call onRemove when "グラフを削除" is clicked', () => {
            render(<ChartDropdownMenu {...defaultProps} />);

            const button = screen.getByText('グラフを削除');
            fireEvent.click(button);

            expect(defaultProps.onRemove).toHaveBeenCalledTimes(1);
        });
    });
});

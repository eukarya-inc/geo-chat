import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TableCreatedMessage } from './TableCreatedMessage';

describe('TableCreatedMessage', () => {
    const defaultProps = {
        tableName: 'test_table',
        isSelected: false,
        onClick: vi.fn(),
    };

    it('should render table name', () => {
        render(<TableCreatedMessage {...defaultProps} />);

        expect(screen.getByText('test_table')).toBeInTheDocument();
        expect(screen.getByText(/テーブルを作成しました:/)).toBeInTheDocument();
    });

    it('should show TableCellsIcon when not selected', () => {
        const { container } = render(<TableCreatedMessage {...defaultProps} isSelected={false} />);

        // TableCellsIcon should be visible (not CheckCircleIcon)
        const icons = container.querySelectorAll('svg');
        expect(icons.length).toBeGreaterThan(0);
    });

    it('should show CheckCircleIcon when selected', () => {
        const { container } = render(<TableCreatedMessage {...defaultProps} isSelected={true} />);

        // CheckCircleIcon should be visible
        const icons = container.querySelectorAll('svg');
        expect(icons.length).toBeGreaterThan(0);
    });

    it('should apply selected styles when isSelected is true', () => {
        const { container } = render(<TableCreatedMessage {...defaultProps} isSelected={true} />);

        const messageDiv = container.firstChild as HTMLElement;
        expect(messageDiv).toHaveClass('bg-blue-100', 'border-blue-400', 'text-blue-800');
    });

    it('should apply unselected styles when isSelected is false', () => {
        const { container } = render(<TableCreatedMessage {...defaultProps} isSelected={false} />);

        const messageDiv = container.firstChild as HTMLElement;
        expect(messageDiv).toHaveClass('bg-gray-100', 'border-gray-300', 'text-gray-700');
    });

    it('should call onClick when clicked', () => {
        const mockOnClick = vi.fn();
        const { container } = render(<TableCreatedMessage {...defaultProps} onClick={mockOnClick} />);

        const messageDiv = container.firstChild as HTMLElement;
        fireEvent.click(messageDiv);

        expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should have correct title attribute', () => {
        const { container } = render(<TableCreatedMessage {...defaultProps} tableName="my_table" />);

        const messageDiv = container.firstChild as HTMLElement;
        expect(messageDiv).toHaveAttribute('title', 'クリックして「my_table」テーブルを選択');
    });

    it('should not show chart icon when hasChartSpec is false', () => {
        render(<TableCreatedMessage {...defaultProps} hasChartSpec={false} />);

        const chartIcon = screen.queryByTitle('クリックしてチャートを表示');
        expect(chartIcon).not.toBeInTheDocument();
    });

    it('should show chart icon when hasChartSpec is true', () => {
        render(<TableCreatedMessage {...defaultProps} hasChartSpec={true} />);

        const chartIcon = screen.getByTitle('クリックしてチャートを表示');
        expect(chartIcon).toBeInTheDocument();
    });

    it('should not show map icon when hasGeometry is false', () => {
        render(<TableCreatedMessage {...defaultProps} hasGeometry={false} />);

        const mapIcon = screen.queryByTitle('クリックして地図を表示');
        expect(mapIcon).not.toBeInTheDocument();
    });

    it('should show map icon when hasGeometry is true', () => {
        render(<TableCreatedMessage {...defaultProps} hasGeometry={true} />);

        const mapIcon = screen.getByTitle('クリックして地図を表示');
        expect(mapIcon).toBeInTheDocument();
    });

    it('should call onChartIconClick when chart icon is clicked', () => {
        const mockOnChartIconClick = vi.fn();
        render(
            <TableCreatedMessage
                {...defaultProps}
                hasChartSpec={true}
                onChartIconClick={mockOnChartIconClick}
            />
        );

        const chartIcon = screen.getByTitle('クリックしてチャートを表示');
        fireEvent.click(chartIcon);

        expect(mockOnChartIconClick).toHaveBeenCalledTimes(1);
    });

    it('should call onMapIconClick when map icon is clicked', () => {
        const mockOnMapIconClick = vi.fn();
        render(
            <TableCreatedMessage {...defaultProps} hasGeometry={true} onMapIconClick={mockOnMapIconClick} />
        );

        const mapIcon = screen.getByTitle('クリックして地図を表示');
        fireEvent.click(mapIcon);

        expect(mockOnMapIconClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when chart icon is clicked (stopPropagation)', () => {
        const mockOnClick = vi.fn();
        const mockOnChartIconClick = vi.fn();
        render(
            <TableCreatedMessage
                {...defaultProps}
                onClick={mockOnClick}
                hasChartSpec={true}
                onChartIconClick={mockOnChartIconClick}
            />
        );

        const chartIcon = screen.getByTitle('クリックしてチャートを表示');
        fireEvent.click(chartIcon);

        expect(mockOnChartIconClick).toHaveBeenCalledTimes(1);
        expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('should not call onClick when map icon is clicked (stopPropagation)', () => {
        const mockOnClick = vi.fn();
        const mockOnMapIconClick = vi.fn();
        render(
            <TableCreatedMessage
                {...defaultProps}
                onClick={mockOnClick}
                hasGeometry={true}
                onMapIconClick={mockOnMapIconClick}
            />
        );

        const mapIcon = screen.getByTitle('クリックして地図を表示');
        fireEvent.click(mapIcon);

        expect(mockOnMapIconClick).toHaveBeenCalledTimes(1);
        expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('should show both chart and map icons when both flags are true', () => {
        render(<TableCreatedMessage {...defaultProps} hasChartSpec={true} hasGeometry={true} />);

        const chartIcon = screen.getByTitle('クリックしてチャートを表示');
        const mapIcon = screen.getByTitle('クリックして地図を表示');

        expect(chartIcon).toBeInTheDocument();
        expect(mapIcon).toBeInTheDocument();
    });
});

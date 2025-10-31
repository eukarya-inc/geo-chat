import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DashboardHistoryGrid } from './DashboardHistoryGrid';
import type { Dashboard } from '../../store/remoteAtoms';

describe('DashboardHistoryGrid', () => {
    const mockDashboards: Dashboard[] = [
        {
            id: 'dashboard-1',
            title: 'Test Dashboard 1',
            createdAt: new Date('2024-01-15T10:30:00'),
            visualizations: [],
            layout: [],
        },
        {
            id: 'dashboard-2',
            title: 'Test Dashboard 2',
            createdAt: new Date('2024-01-16T14:20:00'),
            visualizations: [],
            layout: [],
        },
    ];

    const defaultProps = {
        dashboards: mockDashboards,
        onSelectDashboard: vi.fn(),
        onDeleteDashboard: vi.fn(),
        onRenameDashboard: vi.fn(),
        onCreateDashboard: vi.fn(),
    };

    it('should render header with title', () => {
        render(<DashboardHistoryGrid {...defaultProps} />);

        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    });

    it('should render create dashboard button', () => {
        render(<DashboardHistoryGrid {...defaultProps} />);

        expect(screen.getByText('+ 新しいダッシュボード')).toBeInTheDocument();
    });

    it('should render all dashboards', () => {
        render(<DashboardHistoryGrid {...defaultProps} />);

        expect(screen.getByText('Test Dashboard 1')).toBeInTheDocument();
        expect(screen.getByText('Test Dashboard 2')).toBeInTheDocument();
    });

    it('should call onCreateDashboard when create button is clicked', () => {
        const mockOnCreateDashboard = vi.fn();
        render(<DashboardHistoryGrid {...defaultProps} onCreateDashboard={mockOnCreateDashboard} />);

        const createButton = screen.getByText('+ 新しいダッシュボード');
        fireEvent.click(createButton);

        expect(mockOnCreateDashboard).toHaveBeenCalledTimes(1);
    });

    it('should call onSelectDashboard when dashboard card is clicked', () => {
        const mockOnSelectDashboard = vi.fn();
        render(<DashboardHistoryGrid {...defaultProps} onSelectDashboard={mockOnSelectDashboard} />);

        const dashboard1Card = screen.getByText('Test Dashboard 1').closest('div')?.parentElement;
        if (dashboard1Card) {
            fireEvent.click(dashboard1Card);
        }

        expect(mockOnSelectDashboard).toHaveBeenCalledWith('dashboard-1');
    });

    it('should display empty state when no dashboards exist', () => {
        render(<DashboardHistoryGrid {...defaultProps} dashboards={[]} />);

        expect(screen.getByText('ダッシュボードがありません')).toBeInTheDocument();
        expect(screen.getByText('最初のダッシュボードを作成しましょう！')).toBeInTheDocument();
    });

    it('should not display empty state when dashboards exist', () => {
        render(<DashboardHistoryGrid {...defaultProps} />);

        expect(screen.queryByText('ダッシュボードがありません')).not.toBeInTheDocument();
    });

    it('should render dashboard dates', () => {
        render(<DashboardHistoryGrid {...defaultProps} />);

        const dateElements = screen.getAllByText(/last message/);
        expect(dateElements.length).toBe(2);
    });

    it('should handle delete flow', () => {
        const mockOnDeleteDashboard = vi.fn();
        render(<DashboardHistoryGrid {...defaultProps} onDeleteDashboard={mockOnDeleteDashboard} />);

        const dashboard1Card = screen.getByText('Test Dashboard 1').closest('div')?.parentElement;

        // Hover to show delete button
        if (dashboard1Card) {
            fireEvent.mouseEnter(dashboard1Card);
        }

        // Find all buttons with SVG icons (edit and delete buttons)
        const buttons = screen.getAllByRole('button');
        const iconButtons = buttons.filter(btn => btn.querySelector('svg'));

        // Delete button is the second icon button (after edit button)
        const deleteButton = iconButtons[1];

        if (deleteButton) {
            fireEvent.click(deleteButton);
        }

        // Should show confirmation
        expect(screen.getByText('Delete "Test Dashboard 1"?')).toBeInTheDocument();
    });

    it('should handle rename flow', () => {
        const mockOnRenameDashboard = vi.fn();
        render(<DashboardHistoryGrid {...defaultProps} onRenameDashboard={mockOnRenameDashboard} />);

        const dashboard1Card = screen.getByText('Test Dashboard 1').closest('div')?.parentElement;

        // Hover to show edit button
        if (dashboard1Card) {
            fireEvent.mouseEnter(dashboard1Card);
        }

        // Find all buttons with SVG icons (edit and delete buttons)
        const buttons = screen.getAllByRole('button');
        const iconButtons = buttons.filter(btn => btn.querySelector('svg'));

        // Edit button is the first icon button
        const editButton = iconButtons[0];

        if (editButton) {
            fireEvent.click(editButton);
        }

        // Should show input field
        const input = screen.queryByRole('textbox');
        expect(input).toBeInTheDocument();
    });

    it('should use grid layout', () => {
        const { container } = render(<DashboardHistoryGrid {...defaultProps} />);

        const gridElement = container.querySelector('.grid');
        expect(gridElement).toBeInTheDocument();
        expect(gridElement).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
    });

    it('should have proper spacing between cards', () => {
        const { container } = render(<DashboardHistoryGrid {...defaultProps} />);

        const gridElement = container.querySelector('.grid');
        expect(gridElement).toHaveClass('gap-4');
    });

    it('should have green button color for create button', () => {
        render(<DashboardHistoryGrid {...defaultProps} />);

        const createButton = screen.getByText('+ 新しいダッシュボード');
        expect(createButton).toHaveClass('bg-green-500', 'hover:bg-green-600');
    });

    it('should handle empty dashboards array gracefully', () => {
        expect(() => {
            render(<DashboardHistoryGrid {...defaultProps} dashboards={[]} />);
        }).not.toThrow();
    });
});

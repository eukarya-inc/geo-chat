import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatList } from './index';
import type { Dashboard } from '../../../store/remoteAtoms';

describe('ChatList', () => {
  const mockChats = [
    {
      id: 'chat-1',
      title: 'Test Chat 1',
      createdAt: new Date('2024-01-01'),
      messages: [],
      selectedTable: null,
      mapSpecs: {},
    },
  ];

  const mockDashboards: Dashboard[] = [
    {
      id: 'dashboard-1',
      title: 'Test Dashboard 1',
      createdAt: new Date('2024-01-01'),
      visualizations: [],
      layout: [],
    },
    {
      id: 'dashboard-2',
      title: 'Test Dashboard 2',
      createdAt: new Date('2024-01-02'),
      visualizations: [],
      layout: [],
    },
  ];

  const defaultProps = {
    chats: mockChats,
    selectedChatId: null,
    onSelectChat: vi.fn(),
    onCreateChat: vi.fn(),
    onDeleteChat: vi.fn(),
    isInitialized: true,
    dashboards: mockDashboards,
    onCreateDashboard: vi.fn(),
    onSelectDashboard: vi.fn(),
    onDeleteDashboard: vi.fn(),
    onRenameDashboard: vi.fn(),
    selectedDashboardId: null,
  };

  it('should render dashboards with titles', () => {
    render(<ChatList {...defaultProps} />);

    expect(screen.getByText('Test Dashboard 1')).toBeInTheDocument();
    expect(screen.getByText('Test Dashboard 2')).toBeInTheDocument();
  });

  it('should show delete button on dashboard hover', () => {
    render(<ChatList {...defaultProps} />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Initially, delete button should not be visible
    expect(screen.queryByTestId('dashboard-delete-button')).not.toBeInTheDocument();

    // Hover over dashboard container
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);
    }

    // Delete button should now be visible
    expect(screen.queryByTestId('dashboard-delete-button')).toBeInTheDocument();
  });

  it('should show confirmation dialog when delete button is clicked', () => {
    const mockOnDeleteDashboard = vi.fn();
    render(<ChatList {...defaultProps} onDeleteDashboard={mockOnDeleteDashboard} />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Hover over dashboard to show delete button
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);
    }

    // Find and click delete button
    const deleteButton = screen.queryByTestId('dashboard-delete-button');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // Should show confirmation dialog
    expect(screen.getByText('Delete Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete "Test Dashboard 1"? This action cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-delete-dashboard')).toBeInTheDocument();

    // Should not have called delete yet
    expect(mockOnDeleteDashboard).not.toHaveBeenCalled();
  });

  it('should not show delete button when onDeleteDashboard is not provided', () => {
    render(<ChatList {...defaultProps} onDeleteDashboard={undefined} />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Hover over dashboard
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);
    }

    // Delete button should not be visible when onDeleteDashboard is not provided
    expect(screen.queryByTestId('dashboard-delete-button')).not.toBeInTheDocument();
  });

  it('should hide delete button when mouse leaves dashboard', () => {
    render(<ChatList {...defaultProps} />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Hover over dashboard to show delete button
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);

      // Verify delete button is visible
      expect(screen.queryByTestId('dashboard-delete-button')).toBeInTheDocument();

      // Mouse leave
      fireEvent.mouseLeave(dashboardContainer);
    }

    // Delete button should be hidden again
    expect(screen.queryByTestId('dashboard-delete-button')).not.toBeInTheDocument();
  });

  it('should call onDeleteDashboard when confirmation is confirmed', () => {
    const mockOnDeleteDashboard = vi.fn();
    render(<ChatList {...defaultProps} onDeleteDashboard={mockOnDeleteDashboard} />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Hover over dashboard to show delete button
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);
    }

    // Click delete button to show confirmation
    const deleteButton = screen.queryByTestId('dashboard-delete-button');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // Click confirm button
    const confirmButton = screen.queryByTestId('confirm-delete-dashboard');
    if (confirmButton) {
      fireEvent.click(confirmButton);
    }

    // Should have called delete
    expect(mockOnDeleteDashboard).toHaveBeenCalledWith('dashboard-1');

    // Confirmation dialog should be closed
    expect(screen.queryByText('Delete Dashboard')).not.toBeInTheDocument();
  });

  it('should not call onDeleteDashboard when confirmation is canceled', () => {
    const mockOnDeleteDashboard = vi.fn();
    render(<ChatList {...defaultProps} onDeleteDashboard={mockOnDeleteDashboard} />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Hover over dashboard to show delete button
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);
    }

    // Click delete button to show confirmation
    const deleteButton = screen.queryByTestId('dashboard-delete-button');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // Click cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Should not have called delete
    expect(mockOnDeleteDashboard).not.toHaveBeenCalled();

    // Confirmation dialog should be closed
    expect(screen.queryByText('Delete Dashboard')).not.toBeInTheDocument();
  });

  it('should stop event propagation when delete button is clicked', () => {
    const mockOnSelectDashboard = vi.fn();
    const mockOnDeleteDashboard = vi.fn();

    render(
      <ChatList
        {...defaultProps}
        onSelectDashboard={mockOnSelectDashboard}
        onDeleteDashboard={mockOnDeleteDashboard}
      />
    );

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    const dashboardContainer = dashboard1Text.closest('div')?.parentElement;

    // Hover over dashboard to show delete button
    if (dashboardContainer) {
      fireEvent.mouseEnter(dashboardContainer);
    }

    // Find and click delete button
    const deleteButton = screen.queryByTestId('dashboard-delete-button');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // Should show confirmation dialog but not call select or delete yet
    expect(screen.getByText('Delete Dashboard')).toBeInTheDocument();
    expect(mockOnSelectDashboard).not.toHaveBeenCalled();
    expect(mockOnDeleteDashboard).not.toHaveBeenCalled();
  });

  it('should highlight selected dashboard', () => {
    render(<ChatList {...defaultProps} selectedDashboardId="dashboard-1" />);

    const dashboard1Text = screen.getByText('Test Dashboard 1');
    // The text is in: text -> div.text-sm -> div.flex-1 -> div.dashboard-container
    // So we need to go up 3 levels to get to the dashboard container
    const dashboardContainer = dashboard1Text.parentElement?.parentElement?.parentElement;

    expect(dashboardContainer).toHaveClass('bg-green-50');
    expect(dashboardContainer).toHaveClass('border-green-200');
  });

  it('should render empty state when no dashboards exist', () => {
    render(<ChatList {...defaultProps} dashboards={[]} />);

    expect(screen.getByText('ダッシュボードがありません')).toBeInTheDocument();
  });

  it('should show create dashboard button when onCreateDashboard is provided', () => {
    render(<ChatList {...defaultProps} />);

    expect(screen.getByText('新しいダッシュボード')).toBeInTheDocument();
  });

  it('should call onCreateDashboard when create button is clicked', () => {
    const mockOnCreateDashboard = vi.fn();
    render(<ChatList {...defaultProps} onCreateDashboard={mockOnCreateDashboard} />);

    const createButton = screen.getByText('新しいダッシュボード');
    fireEvent.click(createButton);

    expect(mockOnCreateDashboard).toHaveBeenCalled();
  });
});
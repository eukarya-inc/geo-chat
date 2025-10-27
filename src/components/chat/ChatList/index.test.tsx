import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatList } from './index';

describe('ChatList', () => {
    const defaultProps = {
        onCreateChat: vi.fn(),
        onCreateDashboard: vi.fn(),
        isInitialized: true,
    };

    it('should render navigation buttons', () => {
        render(<ChatList {...defaultProps} />);

        expect(screen.getByText('Chat')).toBeInTheDocument();
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('should render create buttons when initialized', () => {
        render(<ChatList {...defaultProps} isInitialized={true} />);

        expect(screen.getByText('新しいチャット')).toBeInTheDocument();
        expect(screen.getByText('新しいダッシュボード')).toBeInTheDocument();
    });

    it('should not render create buttons when not initialized', () => {
        render(<ChatList {...defaultProps} isInitialized={false} />);

        expect(screen.queryByText('新しいチャット')).not.toBeInTheDocument();
        expect(screen.queryByText('新しいダッシュボード')).not.toBeInTheDocument();
    });

    it('should call onCreateChat when create chat button is clicked', () => {
        const mockOnCreateChat = vi.fn();
        render(<ChatList {...defaultProps} onCreateChat={mockOnCreateChat} />);

        const createButton = screen.getByText('新しいチャット');
        fireEvent.click(createButton);

        expect(mockOnCreateChat).toHaveBeenCalledTimes(1);
    });

    it('should call onCreateDashboard when create dashboard button is clicked', () => {
        const mockOnCreateDashboard = vi.fn();
        render(<ChatList {...defaultProps} onCreateDashboard={mockOnCreateDashboard} />);

        const createButton = screen.getByText('新しいダッシュボード');
        fireEvent.click(createButton);

        expect(mockOnCreateDashboard).toHaveBeenCalledTimes(1);
    });

    it('should highlight selected view', () => {
        const { rerender } = render(<ChatList {...defaultProps} selectedView="chat-history" />);

        const chatButton = screen.getByText('Chat');
        expect(chatButton).toHaveClass('bg-blue-50', 'border', 'border-blue-200');

        rerender(<ChatList {...defaultProps} selectedView="dashboard-list" />);
        const dashboardButton = screen.getByText('Dashboard');
        expect(dashboardButton).toHaveClass('bg-blue-50', 'border', 'border-blue-200');
    });

    it('should not highlight any view when selectedView is undefined', () => {
        render(<ChatList {...defaultProps} selectedView={undefined} />);

        const chatButton = screen.getByText('Chat');
        const dashboardButton = screen.getByText('Dashboard');

        expect(chatButton).not.toHaveClass('bg-blue-50');
        expect(dashboardButton).not.toHaveClass('bg-blue-50');
    });

    it('should call onNavigate with correct view when navigation button is clicked', () => {
        const mockOnNavigate = vi.fn();
        render(<ChatList {...defaultProps} onNavigate={mockOnNavigate} />);

        const chatButton = screen.getByText('Chat');
        fireEvent.click(chatButton);
        expect(mockOnNavigate).toHaveBeenCalledWith('chat-list');

        const dashboardButton = screen.getByText('Dashboard');
        fireEvent.click(dashboardButton);
        expect(mockOnNavigate).toHaveBeenCalledWith('dashboard-list');
    });

    it('should handle navigation when onNavigate is not provided', () => {
        // Should not throw error
        render(<ChatList {...defaultProps} />);

        const chatButton = screen.getByText('Chat');
        expect(() => fireEvent.click(chatButton)).not.toThrow();
    });

    it('should show hover effect on navigation buttons', () => {
        render(<ChatList {...defaultProps} />);

        const chatButton = screen.getByText('Chat');
        expect(chatButton).toHaveClass('hover:bg-gray-100');
    });

    it('should have correct button structure', () => {
        render(<ChatList {...defaultProps} />);

        const chatButton = screen.getByText('Chat');
        expect(chatButton.tagName).toBe('BUTTON');
        expect(chatButton).toHaveClass('w-full', 'px-4', 'py-3', 'text-left');
    });
});

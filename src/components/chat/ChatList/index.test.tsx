import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatList } from './index';

describe('ChatList', () => {
    const defaultProps = {};

    it('should render navigation buttons', () => {
        render(<ChatList {...defaultProps} />);

        expect(screen.getByText('チャット')).toBeInTheDocument();
        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    });

    it('should highlight selected view', () => {
        const { rerender } = render(<ChatList {...defaultProps} selectedView="chat" />);

        const chatButton = screen.getByText('チャット').closest('button');
        expect(chatButton).toHaveClass('bg-blue-50', 'border', 'border-blue-200');

        rerender(<ChatList {...defaultProps} selectedView="dashboard-list" />);
        const dashboardButton = screen.getByText('ダッシュボード').closest('button');
        expect(dashboardButton).toHaveClass('bg-blue-50', 'border', 'border-blue-200');
    });

    it('should not highlight any view when selectedView is undefined', () => {
        render(<ChatList {...defaultProps} selectedView={undefined} />);

        const chatButton = screen.getByText('チャット').closest('button');
        const dashboardButton = screen.getByText('ダッシュボード').closest('button');

        expect(chatButton).not.toHaveClass('bg-blue-50');
        expect(dashboardButton).not.toHaveClass('bg-blue-50');
    });

    it('should call onNavigate with correct view when navigation button is clicked', () => {
        const mockOnNavigate = vi.fn();
        render(<ChatList {...defaultProps} onNavigate={mockOnNavigate} />);

        const chatButton = screen.getByText('チャット');
        fireEvent.click(chatButton);
        expect(mockOnNavigate).toHaveBeenCalledWith('chat');

        const dashboardButton = screen.getByText('ダッシュボード');
        fireEvent.click(dashboardButton);
        expect(mockOnNavigate).toHaveBeenCalledWith('dashboard-list');
    });

    it('should handle navigation when onNavigate is not provided', () => {
        // Should not throw error
        render(<ChatList {...defaultProps} />);

        const chatButton = screen.getByText('チャット');
        expect(() => fireEvent.click(chatButton)).not.toThrow();
    });

    it('should show hover effect on navigation buttons', () => {
        render(<ChatList {...defaultProps} />);

        const chatButton = screen.getByText('チャット').closest('button');
        expect(chatButton).toHaveClass('hover:bg-gray-100');
    });

    it('should have correct button structure', () => {
        render(<ChatList {...defaultProps} />);

        const chatButton = screen.getByText('チャット').closest('button');
        expect(chatButton?.tagName).toBe('BUTTON');
        expect(chatButton).toHaveClass('w-full', 'px-4', 'py-3', 'text-left');
    });
});

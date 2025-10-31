import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatHistoryGrid } from './ChatHistoryGrid';
import type { Chat } from '../../store/remoteAtoms';

describe('ChatHistoryGrid', () => {
    const mockChats: Chat[] = [
        {
            id: 'chat-1',
            title: 'Test Chat 1',
            createdAt: new Date('2024-01-15T10:30:00'),
            selectedTable: null,
            messages: [],
            tables: {},
            chartSpecs: {},
            mapSpecs: {},
        },
        {
            id: 'chat-2',
            title: 'Test Chat 2',
            createdAt: new Date('2024-01-16T14:20:00'),
            selectedTable: null,
            messages: [],
            tables: {},
            chartSpecs: {},
            mapSpecs: {},
        },
    ];

    const defaultProps = {
        chats: mockChats,
        onSelectChat: vi.fn(),
        onDeleteChat: vi.fn(),
        onRenameChat: vi.fn(),
    };

    it('should render all chats', () => {
        render(<ChatHistoryGrid {...defaultProps} />);

        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
        expect(screen.getByText('Test Chat 2')).toBeInTheDocument();
    });

    it('should call onSelectChat when chat card is clicked', () => {
        const mockOnSelectChat = vi.fn();
        render(<ChatHistoryGrid {...defaultProps} onSelectChat={mockOnSelectChat} />);

        const chat1Card = screen.getByText('Test Chat 1').closest('div')?.parentElement;
        if (chat1Card) {
            fireEvent.click(chat1Card);
        }

        expect(mockOnSelectChat).toHaveBeenCalledWith('chat-1');
    });

    it('should render chat dates', () => {
        render(<ChatHistoryGrid {...defaultProps} />);

        const dateElements = screen.getAllByText(/last message/);
        expect(dateElements.length).toBe(2);
    });

    it('should handle delete flow', () => {
        const mockOnDeleteChat = vi.fn();
        render(<ChatHistoryGrid {...defaultProps} onDeleteChat={mockOnDeleteChat} />);

        const chat1Card = screen.getByText('Test Chat 1').closest('div')?.parentElement;

        // Hover to show delete button
        if (chat1Card) {
            fireEvent.mouseEnter(chat1Card);
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
        expect(screen.getByText('Delete "Test Chat 1"?')).toBeInTheDocument();
    });

    it('should handle rename flow', () => {
        const mockOnRenameChat = vi.fn();
        render(<ChatHistoryGrid {...defaultProps} onRenameChat={mockOnRenameChat} />);

        const chat1Card = screen.getByText('Test Chat 1').closest('div')?.parentElement;

        // Hover to show edit button
        if (chat1Card) {
            fireEvent.mouseEnter(chat1Card);
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
        const { container } = render(<ChatHistoryGrid {...defaultProps} />);

        const gridElement = container.querySelector('.grid');
        expect(gridElement).toBeInTheDocument();
        expect(gridElement).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
    });

    it('should have proper spacing between cards', () => {
        const { container } = render(<ChatHistoryGrid {...defaultProps} />);

        const gridElement = container.querySelector('.grid');
        expect(gridElement).toHaveClass('gap-4');
    });

    it('should handle empty chats array gracefully', () => {
        expect(() => {
            render(<ChatHistoryGrid {...defaultProps} chats={[]} />);
        }).not.toThrow();
    });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { HistoryCard } from './HistoryCard';

describe('HistoryCard', () => {
    const mockDate = new Date('2024-01-15T10:30:00');

    const defaultProps = {
        title: 'Test Card',
        date: mockDate,
        onClick: vi.fn(),
    };

    it('should render title and date', () => {
        render(<HistoryCard {...defaultProps} />);

        expect(screen.getByText('Test Card')).toBeInTheDocument();
        expect(screen.getByText(/last message/)).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
        render(<HistoryCard {...defaultProps} subtitle="Test Subtitle" />);

        expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
    });

    it('should render badge when provided', () => {
        render(
            <HistoryCard
                {...defaultProps}
                badge={{
                    label: 'New',
                    color: 'blue',
                }}
            />
        );

        expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should apply correct badge color classes', () => {
        const { rerender } = render(
            <HistoryCard
                {...defaultProps}
                badge={{
                    label: 'Blue',
                    color: 'blue',
                }}
            />
        );

        let badge = screen.getByText('Blue');
        expect(badge).toHaveClass('bg-blue-100', 'text-blue-700');

        rerender(
            <HistoryCard
                {...defaultProps}
                badge={{
                    label: 'Green',
                    color: 'green',
                }}
            />
        );

        badge = screen.getByText('Green');
        expect(badge).toHaveClass('bg-green-100', 'text-green-700');

        rerender(
            <HistoryCard
                {...defaultProps}
                badge={{
                    label: 'Purple',
                    color: 'purple',
                }}
            />
        );

        badge = screen.getByText('Purple');
        expect(badge).toHaveClass('bg-purple-100', 'text-purple-700');
    });

    it('should call onClick when card is clicked', () => {
        const mockOnClick = vi.fn();
        render(<HistoryCard {...defaultProps} onClick={mockOnClick} />);

        const card = screen.getByText('Test Card').closest('div')?.parentElement;
        if (card) {
            fireEvent.click(card);
        }

        expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should show edit and delete buttons on hover when callbacks are provided', () => {
        const mockOnStartEdit = vi.fn();
        const mockOnStartDelete = vi.fn();

        render(
            <HistoryCard
                {...defaultProps}
                onStartEdit={mockOnStartEdit}
                onStartDelete={mockOnStartDelete}
                onRename={vi.fn()}
            />
        );

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        // Initially, buttons should not be visible
        expect(screen.queryByRole('button', { name: '' })).not.toBeInTheDocument();

        // Hover over card
        if (card) {
            fireEvent.mouseEnter(card);
        }

        // Edit and delete buttons should now be visible
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it('should hide edit and delete buttons when mouse leaves', () => {
        const mockOnStartEdit = vi.fn();
        const mockOnStartDelete = vi.fn();

        render(
            <HistoryCard
                {...defaultProps}
                onStartEdit={mockOnStartEdit}
                onStartDelete={mockOnStartDelete}
                onRename={vi.fn()}
            />
        );

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        if (card) {
            // Hover to show buttons
            fireEvent.mouseEnter(card);
            const buttonsWhenHovered = screen.getAllByRole('button');
            expect(buttonsWhenHovered.length).toBeGreaterThanOrEqual(2);

            // Mouse leave
            fireEvent.mouseLeave(card);
        }

        // Only the card itself should remain (no edit/delete buttons)
        const buttonsAfterLeave = screen.queryAllByRole('button');
        expect(buttonsAfterLeave.length).toBeLessThan(2);
    });

    it('should enter edit mode when edit button is clicked', () => {
        const mockOnStartEdit = vi.fn();

        render(<HistoryCard {...defaultProps} onStartEdit={mockOnStartEdit} onRename={vi.fn()} isEditing={false} />);

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        if (card) {
            fireEvent.mouseEnter(card);

            // Find edit button (PencilIcon) - it's the first button
            const buttons = screen.getAllByRole('button');
            const editButton = buttons[0];

            fireEvent.click(editButton);
            expect(mockOnStartEdit).toHaveBeenCalledTimes(1);
        }
    });

    it('should show input field in edit mode', () => {
        render(<HistoryCard {...defaultProps} isEditing={true} onRename={vi.fn()} />);

        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();
        expect(input).toHaveValue('Test Card');
    });

    it('should call onRename when Enter is pressed in edit mode', () => {
        const mockOnRename = vi.fn();

        render(<HistoryCard {...defaultProps} isEditing={true} onRename={mockOnRename} />);

        const input = screen.getByRole('textbox');

        fireEvent.change(input, { target: { value: 'New Title' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        expect(mockOnRename).toHaveBeenCalledWith('New Title');
    });

    it('should call onCancelEdit when Escape is pressed in edit mode', () => {
        const mockOnCancelEdit = vi.fn();

        render(<HistoryCard {...defaultProps} isEditing={true} onRename={vi.fn()} onCancelEdit={mockOnCancelEdit} />);

        const input = screen.getByRole('textbox');

        fireEvent.change(input, { target: { value: 'New Title' } });
        fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

        expect(mockOnCancelEdit).toHaveBeenCalledTimes(1);
    });

    it('should call onRename when input is blurred in edit mode', () => {
        const mockOnRename = vi.fn();

        render(<HistoryCard {...defaultProps} isEditing={true} onRename={mockOnRename} />);

        const input = screen.getByRole('textbox');

        fireEvent.change(input, { target: { value: 'Blurred Title' } });
        fireEvent.blur(input);

        expect(mockOnRename).toHaveBeenCalledWith('Blurred Title');
    });

    it('should not call onRename with empty or whitespace-only title', () => {
        const mockOnRename = vi.fn();

        render(<HistoryCard {...defaultProps} isEditing={true} onRename={mockOnRename} />);

        const input = screen.getByRole('textbox');

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.blur(input);

        expect(mockOnRename).not.toHaveBeenCalled();
    });

    it('should show delete confirmation when delete button is clicked', () => {
        const mockOnStartDelete = vi.fn();

        render(
            <HistoryCard
                {...defaultProps}
                onStartDelete={mockOnStartDelete}
                onRename={vi.fn()}
                onStartEdit={vi.fn()}
                isDeleting={false}
            />
        );

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        if (card) {
            fireEvent.mouseEnter(card);

            // Find delete button (TrashIcon) - it's the second button when both edit and delete are present
            const buttons = screen.getAllByRole('button');
            const deleteButton = buttons[1];

            if (deleteButton) {
                fireEvent.click(deleteButton);
                expect(mockOnStartDelete).toHaveBeenCalledTimes(1);
            }
        }
    });

    it('should show delete confirmation UI when isDeleting is true', () => {
        render(<HistoryCard {...defaultProps} isDeleting={true} onConfirmDelete={vi.fn()} onCancelEdit={vi.fn()} />);

        expect(screen.getByText('Delete "Test Card"?')).toBeInTheDocument();
        expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should call onConfirmDelete when delete is confirmed', () => {
        const mockOnConfirmDelete = vi.fn();

        render(
            <HistoryCard
                {...defaultProps}
                isDeleting={true}
                onConfirmDelete={mockOnConfirmDelete}
                onCancelEdit={vi.fn()}
            />
        );

        const deleteButton = screen.getByText('Delete');
        fireEvent.click(deleteButton);

        expect(mockOnConfirmDelete).toHaveBeenCalledTimes(1);
    });

    it('should call onCancelEdit when delete is cancelled', () => {
        const mockOnCancelEdit = vi.fn();

        render(
            <HistoryCard
                {...defaultProps}
                isDeleting={true}
                onConfirmDelete={vi.fn()}
                onCancelEdit={mockOnCancelEdit}
            />
        );

        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(mockOnCancelEdit).toHaveBeenCalledTimes(1);
    });

    it('should stop event propagation when edit button is clicked', () => {
        const mockOnClick = vi.fn();
        const mockOnStartEdit = vi.fn();

        render(
            <HistoryCard {...defaultProps} onClick={mockOnClick} onStartEdit={mockOnStartEdit} onRename={vi.fn()} />
        );

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        if (card) {
            fireEvent.mouseEnter(card);

            const buttons = screen.getAllByRole('button');
            const editButton = buttons[0];

            fireEvent.click(editButton);

            expect(mockOnStartEdit).toHaveBeenCalledTimes(1);
            expect(mockOnClick).not.toHaveBeenCalled();
        }
    });

    it('should stop event propagation when delete button is clicked', () => {
        const mockOnClick = vi.fn();
        const mockOnStartDelete = vi.fn();

        render(
            <HistoryCard {...defaultProps} onClick={mockOnClick} onStartDelete={mockOnStartDelete} onRename={vi.fn()} />
        );

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        if (card) {
            fireEvent.mouseEnter(card);

            const buttons = screen.getAllByRole('button');
            const deleteButton = buttons[1];

            fireEvent.click(deleteButton);

            expect(mockOnStartDelete).toHaveBeenCalledTimes(1);
            expect(mockOnClick).not.toHaveBeenCalled();
        }
    });

    it('should not call onClick when card is clicked in edit mode', () => {
        const mockOnClick = vi.fn();

        render(<HistoryCard {...defaultProps} onClick={mockOnClick} isEditing={true} onRename={vi.fn()} />);

        const card = screen.getByRole('textbox').closest('div')?.parentElement;
        if (card) {
            fireEvent.click(card);
        }

        expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('should not show hover cursor when in edit mode', () => {
        render(<HistoryCard {...defaultProps} isEditing={true} onRename={vi.fn()} />);

        const card = screen.getByRole('textbox').closest('div')?.parentElement;
        expect(card).not.toHaveClass('cursor-pointer');
    });

    it('should not show edit and delete buttons when onRename is not provided', () => {
        const mockOnStartEdit = vi.fn();

        render(<HistoryCard {...defaultProps} onStartEdit={mockOnStartEdit} />);

        const card = screen.getByText('Test Card').closest('div')?.parentElement;

        if (card) {
            fireEvent.mouseEnter(card);
        }

        // Should not show edit button when onRename is missing
        const buttons = screen.queryAllByRole('button');
        expect(buttons.length).toBe(0);
    });
});

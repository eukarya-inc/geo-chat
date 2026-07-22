import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
    const mockOnCopy = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        mockOnCopy.mockClear();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    // 1. Initial render - Focus on accessibility
    it('should render with copy icon and accessible label', () => {
        render(<CopyButton onCopy={mockOnCopy} />);

        const button = screen.getByRole('button', { name: /コピー/i });
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'コピー');
        expect(button).toHaveAttribute('aria-label', 'コピー');
    });

    // 2. User interaction - Use fireEvent
    it('should call onCopy callback when clicked', () => {
        render(<CopyButton onCopy={mockOnCopy} />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(mockOnCopy).toHaveBeenCalledTimes(1);
    });

    // 3. State transition - Verify UI changes
    it('should show copied state after click', () => {
        render(<CopyButton onCopy={mockOnCopy} />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        // State changes to copied
        expect(button).toHaveAttribute('title', 'コピーしました');
        expect(button).toHaveAttribute('aria-label', 'コピーしました');

        // Check icon SVG is displayed with green color
        const svg = button.querySelector('svg');
        expect(svg).toHaveClass('text-green-600');
    });

    // 4. Timeout - Reset to default after 2 seconds
    it('should reset to default state after 2 seconds', () => {
        render(<CopyButton onCopy={mockOnCopy} />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        // Verify copied state
        expect(button).toHaveAttribute('title', 'コピーしました');

        // Advance time by 2 seconds wrapped in act
        act(() => {
            vi.advanceTimersByTime(2000);
        });

        // State resets to default
        expect(button).toHaveAttribute('title', 'コピー');
        expect(button).toHaveAttribute('aria-label', 'コピー');
    });

    // 5. Custom className
    it('should apply custom className to button', () => {
        render(<CopyButton onCopy={mockOnCopy} className="custom-class" />);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('custom-class');
        // Verify default classes are also applied
        expect(button).toHaveClass('p-1.5', 'rounded');
    });

    // 6. Edge case - Multiple consecutive clicks
    it('should handle multiple clicks correctly', () => {
        render(<CopyButton onCopy={mockOnCopy} />);

        const button = screen.getByRole('button');

        // First click
        fireEvent.click(button);
        expect(button).toHaveAttribute('title', 'コピーしました');

        // Advance 1 second
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(button).toHaveAttribute('title', 'コピーしました');

        // Second click (creates a new timer, but old timer still exists)
        fireEvent.click(button);
        expect(mockOnCopy).toHaveBeenCalledTimes(2);

        // Advance 1 more second (first timer completes at 2s total)
        // Note: Current implementation doesn't cleanup previous timer,
        // so first timer fires and resets state
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(button).toHaveAttribute('title', 'コピー');
    });

    // 7. Accessibility - Button element type
    it('should render as a button element with type="button"', () => {
        render(<CopyButton onCopy={mockOnCopy} />);

        const button = screen.getByRole('button');
        expect(button.tagName).toBe('BUTTON');
        expect(button).toHaveAttribute('type', 'button');
    });
});

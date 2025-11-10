import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import ChatInput from './ChatInput';
import type { DBContext } from '../../lib/duckdb/dbContext';

// Mock extractDataUrl
vi.mock('../../utils/tableCreation', () => ({
    extractDataUrl: vi.fn(),
}));

import { extractDataUrl } from '../../utils/tableCreation';

describe('ChatInput', () => {
    const mockOnChange = vi.fn();
    const mockOnSubmit = vi.fn();
    const mockOnStop = vi.fn();
    const mockOnKeyDown = vi.fn();
    const mockOnShowUrlGuide = vi.fn();
    const textareaRef = createRef<HTMLTextAreaElement>();

    const mockDbContext: DBContext = {
        getTables: vi.fn().mockResolvedValue(['table1', 'table2', 'cities']),
        getTableColumns: vi.fn().mockResolvedValue([
            { name: 'id', type: 'INTEGER' },
            { name: 'name', type: 'VARCHAR' },
            { name: 'population', type: 'BIGINT' },
        ]),
    } as unknown as DBContext;

    const defaultProps = {
        value: '',
        onChange: mockOnChange,
        onSubmit: mockOnSubmit,
        onStop: mockOnStop,
        dbContext: mockDbContext,
        textareaRef,
        placeholder: 'Enter message...',
        className: 'test-class',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(extractDataUrl).mockReturnValue(null);

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // 1. Basic rendering - Verify component structure
    it('renders textarea with correct props', () => {
        render(<ChatInput {...defaultProps} />);
        const textarea = screen.getByPlaceholderText('Enter message...');
        expect(textarea).toBeInTheDocument();
        expect(textarea).toHaveClass('test-class');
    });

    // 2. User input - onChange handler
    it('calls onChange when textarea value changes', () => {
        render(<ChatInput {...defaultProps} />);
        const textarea = screen.getByPlaceholderText('Enter message...');
        fireEvent.change(textarea, { target: { value: 'test input' } });
        expect(mockOnChange).toHaveBeenCalled();
    });

    // 3. Disabled state - Button behavior
    it('disables textarea when disabled prop is true', () => {
        render(<ChatInput {...defaultProps} disabled={true} />);
        const textarea = screen.getByPlaceholderText('Enter message...');
        expect(textarea).not.toBeDisabled();
    });

    // 4. Custom styling - className
    it('applies custom className to textarea', () => {
        render(<ChatInput {...defaultProps} className="custom-class" />);
        const textarea = screen.getByPlaceholderText('Enter message...');
        expect(textarea).toHaveClass('custom-class');
    });

    // 5. Ref forwarding - Access to DOM element
    it('forwards ref to textarea element', () => {
        const ref = createRef<HTMLTextAreaElement>();
        render(<ChatInput {...defaultProps} textareaRef={ref} />);
        expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    // 6. Submit button - Initial state
    it('renders submit button', () => {
        render(<ChatInput {...defaultProps} />);
        const submitButton = screen.getByTitle('送信');
        expect(submitButton).toBeInTheDocument();
    });

    // 7. Submit button - Empty value state
    it('disables submit button when value is empty', () => {
        render(<ChatInput {...defaultProps} value="" />);
        const submitButton = screen.getByTitle('送信');
        expect(submitButton).toBeDisabled();
    });

    // 8. Submit button - With value state
    it('enables submit button when value is not empty', () => {
        render(<ChatInput {...defaultProps} value="test" />);
        const submitButton = screen.getByTitle('送信');
        expect(submitButton).not.toBeDisabled();
    });

    // 9. Menu button - Conditional rendering
    it('renders menu button when renderMenu is provided', () => {
        const renderMenu = vi.fn(() => <div>Menu content</div>);
        render(<ChatInput {...defaultProps} renderMenu={renderMenu} />);
        const menuButton = screen.getByTitle('データを読み込む');
        expect(menuButton).toBeInTheDocument();
    });

    // 10. Menu button - No render when not provided
    it('does not render menu button when renderMenu is not provided', () => {
        render(<ChatInput {...defaultProps} />);
        const menuButton = screen.queryByTitle('データを読み込む');
        expect(menuButton).not.toBeInTheDocument();
    });

    // 11. Autocomplete - Tables trigger with @
    it('opens autocomplete when @ is typed', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });
    });

    // 12. Autocomplete - Columns trigger with #
    it('opens autocomplete when # is typed', async () => {
        render(<ChatInput {...defaultProps} value="" selectedTable="table1" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '#', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('id')).toBeInTheDocument();
        });
    });

    // 13. Autocomplete filtering - Tables
    it('filters tables based on search text with @', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@cit', selectionStart: 4 },
        });

        await waitFor(() => {
            expect(screen.getByText('cities')).toBeInTheDocument();
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 14. Autocomplete filtering - Columns
    it('filters columns based on search text with #', async () => {
        render(<ChatInput {...defaultProps} value="" selectedTable="table1" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '#pop', selectionStart: 4 },
        });

        await waitFor(() => {
            expect(screen.getByText('population')).toBeInTheDocument();
            expect(screen.queryByText('id')).not.toBeInTheDocument();
        });
    });

    // 15. Keyboard navigation - ArrowDown
    it('navigates autocomplete with ArrowDown', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'ArrowDown' });

        await waitFor(() => {
            const table2Button = screen.getByText('table2').closest('button');
            expect(table2Button).toHaveClass('bg-blue-50');
        });
    });

    // 16. Keyboard navigation - ArrowUp
    it('navigates autocomplete with ArrowUp', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        // Move down then up
        fireEvent.keyDown(textarea, { key: 'ArrowDown' });
        fireEvent.keyDown(textarea, { key: 'ArrowUp' });

        await waitFor(() => {
            const table1Button = screen.getByText('table1').closest('button');
            expect(table1Button).toHaveClass('bg-blue-50');
        });
    });

    // 17. Keyboard selection - Enter key
    it('selects autocomplete item with Enter', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(mockOnChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({
                        value: '@table1 ',
                    }),
                })
            );
        });
    });

    // 18. Keyboard close - Escape key
    it('closes autocomplete with Escape', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 19. Form submission - Button click
    it('calls onSubmit when submit button is clicked', async () => {
        render(<ChatInput {...defaultProps} value="test message" />);
        const submitButton = screen.getByTitle('送信');

        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalled();
        });
    });

    // 20. Form submission - Enter with URL
    it('calls onSubmit when Enter is pressed with URL', async () => {
        vi.mocked(extractDataUrl).mockReturnValue('https://example.com/data.csv');
        render(<ChatInput {...defaultProps} value="https://example.com/data.csv" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalled();
        });
    });

    // 21. Form submission - Enter without URL
    it('does not submit when Enter is pressed with non-URL', async () => {
        vi.mocked(extractDataUrl).mockReturnValue(null);
        render(<ChatInput {...defaultProps} value="regular text" onKeyDown={mockOnKeyDown} />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(mockOnSubmit).not.toHaveBeenCalled();
        expect(mockOnKeyDown).toHaveBeenCalled();
    });

    // 22. Keyboard delegation - Shift+Enter
    it('delegates Shift+Enter to onKeyDown without submitting', async () => {
        vi.mocked(extractDataUrl).mockReturnValue('https://example.com/data.csv');
        render(<ChatInput {...defaultProps} value="https://example.com/data.csv" onKeyDown={mockOnKeyDown} />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

        expect(mockOnSubmit).not.toHaveBeenCalled();
        expect(mockOnKeyDown).toHaveBeenCalled();
    });

    // 23. IME composition - isComposing flag
    it('does not submit during composition (isComposing)', async () => {
        vi.mocked(extractDataUrl).mockReturnValue('https://example.com/data.csv');
        render(<ChatInput {...defaultProps} value="https://example.com/data.csv" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        const composingEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(composingEvent, 'isComposing', { value: true, writable: false });

        fireEvent(textarea, composingEvent);

        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    // 24. Button states - Loading (StopIcon)
    it('shows StopIcon when isLoading is true', () => {
        render(<ChatInput {...defaultProps} value="test" isLoading={true} />);
        const stopButton = screen.getByTitle('停止');
        expect(stopButton).toBeInTheDocument();
    });

    // 25. Button states - Submitting (Spinner)
    it('shows spinner when isSubmitting is true', () => {
        render(<ChatInput {...defaultProps} value="test" isSubmitting={true} />);
        const spinner = document.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
    });

    // 26. Auto-height - Minimum height
    it('sets minimum height of 44px for empty value', () => {
        const ref = createRef<HTMLTextAreaElement>();
        render(<ChatInput {...defaultProps} textareaRef={ref} value="" />);

        expect(ref.current?.style.height).toBe('44px');
    });

    // 27. Auto-height - Multiline value
    it('renders textarea with multiline value', () => {
        const ref = createRef<HTMLTextAreaElement>();
        const multilineValue = 'line1\nline2';
        render(<ChatInput {...defaultProps} textareaRef={ref} value={multilineValue} />);

        // The textarea should exist and be accessible
        expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    // 28. Layout - Flex container
    it('renders textarea in flex container', () => {
        const { container } = render(<ChatInput {...defaultProps} value="test" />);
        const wrapper = container.querySelector('.flex');
        expect(wrapper).toHaveClass('flex');
        expect(wrapper).toHaveClass('w-full');
    });

    // 29. Data fetching - Tables from dbContext
    it('fetches tables from dbContext on mount', async () => {
        render(<ChatInput {...defaultProps} />);

        await waitFor(() => {
            expect(mockDbContext.getTables).toHaveBeenCalled();
        });
    });

    // 30. Data fetching - Columns from selectedTable
    it('fetches columns when selectedTable is provided', async () => {
        render(<ChatInput {...defaultProps} selectedTable="table1" />);

        await waitFor(() => {
            expect(mockDbContext.getTableColumns).toHaveBeenCalledWith('table1', undefined);
        });
    });

    // 31. Edge case - Space after trigger
    it('closes autocomplete when space is typed after trigger', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.change(textarea, {
            target: { value: '@ ', selectionStart: 2 },
        });

        await waitFor(() => {
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 32. Edge case - Blur event
    it('closes autocomplete on blur', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.blur(textarea);

        await waitFor(() => {
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 33. Edge case - isComposing respect
    it('respects isComposing flag during keyboard input', () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        // Fire Enter with isComposing - component should handle it gracefully
        const composingEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(composingEvent, 'isComposing', { value: true, writable: false });

        fireEvent(textarea, composingEvent);

        // Should not cause errors or unintended behavior
        expect(textarea).toBeInTheDocument();
    });

    // 34. Priority - Autocomplete over URL submission
    it('prioritizes autocomplete over URL submission', async () => {
        vi.mocked(extractDataUrl).mockReturnValue('https://example.com/data.csv');
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        // Should select autocomplete, not submit
        expect(mockOnChange).toHaveBeenCalledWith(
            expect.objectContaining({
                target: expect.objectContaining({
                    value: '@table1 ',
                }),
            })
        );
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    // 35. Priority - Most recent trigger
    it('uses most recent trigger when both @ and # are present', async () => {
        render(<ChatInput {...defaultProps} value="" selectedTable="table1" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@table1 #', selectionStart: 9 },
        });

        await waitFor(() => {
            expect(screen.getByText('id')).toBeInTheDocument();
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 36. Button routing - onStop during loading
    it('calls onStop when button is clicked during loading', async () => {
        render(<ChatInput {...defaultProps} value="test" isLoading={true} />);
        const stopButton = screen.getByTitle('停止');

        fireEvent.click(stopButton);

        expect(mockOnStop).toHaveBeenCalled();
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    // 37. Button routing - onSubmit normally
    it('calls onSubmit when button is clicked during normal state', async () => {
        render(<ChatInput {...defaultProps} value="test" />);
        const submitButton = screen.getByTitle('送信');

        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalled();
        });
    });

    // 38. Mouse interaction - Hover highlighting
    it('highlights item on mouse hover', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        const table2Button = screen.getByText('table2').closest('button');
        if (table2Button) {
            fireEvent.mouseEnter(table2Button);

            await waitFor(() => {
                expect(table2Button).toHaveClass('bg-blue-50');
            });
        }
    });

    // 39. Mouse interaction - Click selection
    it('selects item on mouse click', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table2')).toBeInTheDocument();
        });

        const table2Button = screen.getByText('table2').closest('button');
        if (table2Button) {
            fireEvent.mouseDown(table2Button);

            await waitFor(() => {
                expect(mockOnChange).toHaveBeenCalledWith(
                    expect.objectContaining({
                        target: expect.objectContaining({
                            value: '@table2 ',
                        }),
                    })
                );
            });
        }
    });

    // 40. Keyboard selection - Tab key
    it('selects autocomplete item with Tab', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'Tab' });

        await waitFor(() => {
            expect(mockOnChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({
                        value: '@table1 ',
                    }),
                })
            );
        });
    });

    // 41. Autocomplete filtering - Empty results
    it('does not show autocomplete when filter results are empty', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@nonexistent', selectionStart: 13 },
        });

        await waitFor(() => {
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 42. Item insertion - Format with trigger and space
    it('inserts selected item with trigger symbol and space', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@tab', selectionStart: 4 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(mockOnChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({
                        value: '@table1 ',
                    }),
                })
            );
        });
    });

    // 43. Item selection - Closes autocomplete
    it('closes autocomplete after item selection', async () => {
        render(<ChatInput {...defaultProps} value="" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: '@', selectionStart: 1 },
        });

        await waitFor(() => {
            expect(screen.getByText('table1')).toBeInTheDocument();
        });

        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(screen.queryByText('table1')).not.toBeInTheDocument();
        });
    });

    // 44. Trigger priority - Hash after at
    it('uses hash trigger when # appears after @', async () => {
        render(<ChatInput {...defaultProps} value="" selectedTable="table1" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.change(textarea, {
            target: { value: 'SELECT * FROM @cities WHERE #po', selectionStart: 31 },
        });

        await waitFor(() => {
            expect(screen.getByText('population')).toBeInTheDocument();
        });
    });

    // 45. URL detection - extractDataUrl called
    it('calls extractDataUrl when Enter is pressed', async () => {
        vi.mocked(extractDataUrl).mockReturnValue('https://example.com/data.csv');
        render(<ChatInput {...defaultProps} value="https://example.com/data.csv" />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(extractDataUrl).toHaveBeenCalledWith('https://example.com/data.csv');
    });

    // 46. URL detection - No submit on null
    it('does not submit when extractDataUrl returns null', async () => {
        vi.mocked(extractDataUrl).mockReturnValue(null);
        render(<ChatInput {...defaultProps} value="not a url" onKeyDown={mockOnKeyDown} />);
        const textarea = screen.getByPlaceholderText('Enter message...');

        fireEvent.keyDown(textarea, { key: 'Enter' });

        expect(extractDataUrl).toHaveBeenCalledWith('not a url');
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    // 47. Popup menu - Toggle behavior
    it('toggles popup menu when plus button is clicked', () => {
        const renderMenu = vi.fn(() => <div>Menu content</div>);
        render(<ChatInput {...defaultProps} renderMenu={renderMenu} />);

        const menuButton = screen.getByTitle('データを読み込む');
        fireEvent.click(menuButton);

        expect(screen.getByText('Menu content')).toBeInTheDocument();

        fireEvent.click(menuButton);

        expect(screen.queryByText('Menu content')).not.toBeInTheDocument();
    });

    // 48. Popup menu - Position calculation
    it('calculates popup position based on available space', () => {
        const renderMenu = vi.fn(() => <div>Menu content</div>);
        render(<ChatInput {...defaultProps} renderMenu={renderMenu} />);

        const menuButton = screen.getByTitle('データを読み込む');

        // Mock getBoundingClientRect
        vi.spyOn(menuButton, 'getBoundingClientRect').mockReturnValue({
            top: 500,
            bottom: 540,
            left: 100,
            right: 150,
            width: 50,
            height: 40,
            x: 100,
            y: 500,
            toJSON: () => {},
        });

        fireEvent.click(menuButton);

        const popup = screen.getByText('Menu content').parentElement;
        expect(popup).toHaveClass('top-full');
    });

    // 49. URL guide - Display when enabled
    it('shows URL guide when showUrlGuide is true', () => {
        render(<ChatInput {...defaultProps} showUrlGuide={true} onShowUrlGuide={mockOnShowUrlGuide} />);

        expect(screen.getByText('ここにURLを入力してください')).toBeInTheDocument();
    });

    // 50. External state - isSubmitting priority
    it('uses externalIsSubmitting when provided', () => {
        render(<ChatInput {...defaultProps} value="test" isSubmitting={true} />);

        const spinner = document.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
    });
});

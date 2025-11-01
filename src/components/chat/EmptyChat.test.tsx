import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EmptyChat from './EmptyChat';

// Mock child components
vi.mock('./ChatInput', () => ({
    default: ({
        value,
        onChange,
        onSubmit,
        onKeyDown,
        disabled,
        isSubmitting,
        showUrlGuide,
        onShowUrlGuide,
        renderMenu,
    }: {
        value: string;
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
        onSubmit: (e: React.FormEvent) => void;
        onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
        disabled?: boolean;
        isSubmitting?: boolean;
        showUrlGuide?: boolean;
        onShowUrlGuide?: () => void;
        renderMenu?: (onClose: () => void, onShowUrlGuide?: () => void) => React.ReactNode;
    }) => (
        <div data-testid="chat-input-mock">
            <textarea
                data-testid="chat-input-textarea"
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                disabled={disabled}
            />
            <button data-testid="chat-input-submit" onClick={onSubmit}>
                Submit
            </button>
            {isSubmitting && <span data-testid="chat-input-loading">Loading...</span>}
            {showUrlGuide && <span data-testid="url-guide">URL Guide</span>}
            {onShowUrlGuide && (
                <button data-testid="show-url-guide-button" onClick={onShowUrlGuide}>
                    Show URL Guide
                </button>
            )}
            {renderMenu && renderMenu(() => {}, onShowUrlGuide)}
        </div>
    ),
}));

vi.mock('./ApiKeyInput', () => ({
    default: ({
        apiKey,
        onApiKeyChange,
        onSave,
    }: {
        apiKey: string;
        onApiKeyChange: (value: string) => void;
        onSave: (apiKey: string) => Promise<boolean>;
    }) => (
        <div data-testid="api-key-input-mock">
            <input data-testid="api-key-input" value={apiKey} onChange={e => onApiKeyChange(e.target.value)} />
            <button data-testid="api-key-save" onClick={() => onSave(apiKey)}>
                Save
            </button>
        </div>
    ),
}));

describe('EmptyChat', () => {
    const mockSendMessage = vi.fn();
    const mockOnChatCreated = vi.fn();
    const mockOnApiKeyChange = vi.fn();
    const mockOnApiKeySave = vi.fn();
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    const defaultProps = {
        dbContext: null,
        sendMessage: mockSendMessage,
    };

    beforeEach(() => {
        mockSendMessage.mockClear();
        mockOnChatCreated.mockClear();
        mockOnApiKeyChange.mockClear();
        mockOnApiKeySave.mockClear();
        // Suppress console.error in tests
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    // 1. Basic rendering
    it('should render title', () => {
        render(<EmptyChat {...defaultProps} />);

        expect(screen.getByText('今日はどんな分析をしますか？')).toBeInTheDocument();
    });

    it('should render help text', () => {
        render(<EmptyChat {...defaultProps} />);

        expect(screen.getByText('Enterで改行、Shift+Enterで送信')).toBeInTheDocument();
    });

    it('should render ChatInput component', () => {
        render(<EmptyChat {...defaultProps} />);

        expect(screen.getByTestId('chat-input-mock')).toBeInTheDocument();
    });

    // 2. ApiKeyInput conditional rendering
    it('should show ApiKeyInput when showApiKeyInput is true', () => {
        render(
            <EmptyChat
                {...defaultProps}
                showApiKeyInput={true}
                apiKey="test-key"
                onApiKeyChange={mockOnApiKeyChange}
                onApiKeySave={mockOnApiKeySave}
            />
        );

        expect(screen.getByTestId('api-key-input-mock')).toBeInTheDocument();
    });

    it('should not show ApiKeyInput when showApiKeyInput is false', () => {
        render(<EmptyChat {...defaultProps} showApiKeyInput={false} />);

        expect(screen.queryByTestId('api-key-input-mock')).not.toBeInTheDocument();
    });

    // 3. Error display
    it('should display error message when sendMessage fails', async () => {
        mockSendMessage.mockRejectedValue(new Error('Network error'));

        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test message' } });

        const submitButton = screen.getByTestId('chat-input-submit');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/メッセージの送信に失敗しました/)).toBeInTheDocument();
            expect(screen.getByText(/Network error/)).toBeInTheDocument();
        });
    });

    it('should close error message when close button is clicked', async () => {
        mockSendMessage.mockRejectedValue(new Error('Test error'));

        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test' } });

        const submitButton = screen.getByTestId('chat-input-submit');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/Test error/)).toBeInTheDocument();
        });

        const closeButton = screen.getByTitle('閉じる');
        fireEvent.click(closeButton);

        expect(screen.queryByText(/Test error/)).not.toBeInTheDocument();
    });

    it('should display error with correct styling', async () => {
        mockSendMessage.mockRejectedValue(new Error('Error'));

        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test' } });
        fireEvent.click(screen.getByTestId('chat-input-submit'));

        await waitFor(() => {
            expect(screen.getByText(/メッセージの送信に失敗しました/)).toBeInTheDocument();
        });

        // Check that error container has correct styling
        const errorText = screen.getByText(/メッセージの送信に失敗しました/);
        const errorContainer = errorText.closest('.bg-red-50');
        expect(errorContainer).toHaveClass('bg-red-50', 'border', 'border-red-300');
    });

    // 4. Message submission
    it('should call sendMessage when form is submitted', async () => {
        mockSendMessage.mockResolvedValue({ chatId: 'chat-123', tableName: 'table1' });

        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test message' } });

        const submitButton = screen.getByTestId('chat-input-submit');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalledWith('test message');
        });
    });

    it('should call onChatCreated when sendMessage succeeds', async () => {
        mockSendMessage.mockResolvedValue({ chatId: 'chat-123', tableName: 'table1' });

        render(<EmptyChat {...defaultProps} apiKey="test-key" onChatCreated={mockOnChatCreated} />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test message' } });
        fireEvent.click(screen.getByTestId('chat-input-submit'));

        await waitFor(() => {
            expect(mockOnChatCreated).toHaveBeenCalledWith('chat-123', 'table1');
        });
    });

    it('should not call onChatCreated when sendMessage returns null', async () => {
        mockSendMessage.mockResolvedValue(null);

        render(<EmptyChat {...defaultProps} apiKey="test-key" onChatCreated={mockOnChatCreated} />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test' } });
        fireEvent.click(screen.getByTestId('chat-input-submit'));

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalled();
        });

        expect(mockOnChatCreated).not.toHaveBeenCalled();
    });

    it('should not submit when input is empty', async () => {
        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        fireEvent.click(screen.getByTestId('chat-input-submit'));

        // Wait a bit to ensure sendMessage is not called
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should not submit when input is only whitespace', async () => {
        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: '   ' } });
        fireEvent.click(screen.getByTestId('chat-input-submit'));

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    // 5. Input change
    it('should update input value on change', () => {
        render(<EmptyChat {...defaultProps} />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'new value' } });

        expect(textarea).toHaveValue('new value');
    });

    // 6. Props propagation
    it('should pass correct props to ChatInput', () => {
        render(<EmptyChat {...defaultProps} apiKey="test-key" schemaName="test-schema" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        expect(textarea).not.toBeDisabled();
    });

    it('should pass correct props to ApiKeyInput', () => {
        render(
            <EmptyChat
                {...defaultProps}
                showApiKeyInput={true}
                apiKey="test-key"
                onApiKeyChange={mockOnApiKeyChange}
                onApiKeySave={mockOnApiKeySave}
            />
        );

        const input = screen.getByTestId('api-key-input');
        expect(input).toHaveValue('test-key');
    });

    // 7. Sample data loading
    it('should handle sample data loading success', async () => {
        mockSendMessage.mockResolvedValue({ chatId: 'chat-123', tableName: 'sample-table' });

        const mockRenderMenu = (
            _onClose: () => void,
            _onShowUrlGuide?: () => void,
            onLoadSample?: (url: string) => void
        ) => (
            <button data-testid="load-sample" onClick={() => onLoadSample?.('http://example.com/data.csv')}>
                Load Sample
            </button>
        );

        render(
            <EmptyChat
                {...defaultProps}
                apiKey="test-key"
                renderMenu={mockRenderMenu}
                onChatCreated={mockOnChatCreated}
            />
        );

        const loadSampleButton = screen.getByTestId('load-sample');
        fireEvent.click(loadSampleButton);

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalledWith('http://example.com/data.csv');
            expect(mockOnChatCreated).toHaveBeenCalledWith('chat-123', 'sample-table');
        });
    });

    it('should display error when sample data loading fails', async () => {
        mockSendMessage.mockRejectedValue(new Error('Failed to load'));

        const mockRenderMenu = (
            _onClose: () => void,
            _onShowUrlGuide?: () => void,
            onLoadSample?: (url: string) => void
        ) => (
            <button data-testid="load-sample" onClick={() => onLoadSample?.('http://example.com/data.csv')}>
                Load Sample
            </button>
        );

        render(<EmptyChat {...defaultProps} apiKey="test-key" renderMenu={mockRenderMenu} />);

        fireEvent.click(screen.getByTestId('load-sample'));

        await waitFor(() => {
            expect(screen.getByText(/サンプルデータの読み込みに失敗しました/)).toBeInTheDocument();
            expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
        });
    });

    it('should set isLoadingSample state during sample loading', async () => {
        mockSendMessage.mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ chatId: '123' }), 100))
        );

        const mockRenderMenu = (
            _onClose: () => void,
            _onShowUrlGuide?: () => void,
            onLoadSample?: (url: string) => void
        ) => (
            <button data-testid="load-sample" onClick={() => onLoadSample?.('http://example.com/data.csv')}>
                Load Sample
            </button>
        );

        render(<EmptyChat {...defaultProps} apiKey="test-key" renderMenu={mockRenderMenu} />);

        fireEvent.click(screen.getByTestId('load-sample'));

        // isSubmitting should be passed to ChatInput, which shows loading indicator
        await waitFor(() => {
            expect(screen.getByTestId('chat-input-loading')).toBeInTheDocument();
        });
    });

    // 8. Shift+Enter submission
    it('should submit when Shift+Enter is pressed', async () => {
        mockSendMessage.mockResolvedValue({ chatId: 'chat-123' });

        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test message' } });

        fireEvent.keyDown(textarea, {
            key: 'Enter',
            shiftKey: true,
            nativeEvent: { isComposing: false },
        });

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalledWith('test message');
        });
    });

    it('should not submit when Enter is pressed without Shift', async () => {
        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test' } });

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    // 9. Disabled conditions
    it('should disable ChatInput when apiKey is not provided', () => {
        render(<EmptyChat {...defaultProps} apiKey="" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        expect(textarea).toBeDisabled();
    });

    it('should disable ChatInput when isLoadingSample is true', async () => {
        mockSendMessage.mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ chatId: '123' }), 100))
        );

        const mockRenderMenu = (
            _onClose: () => void,
            _onShowUrlGuide?: () => void,
            onLoadSample?: (url: string) => void
        ) => (
            <button data-testid="load-sample" onClick={() => onLoadSample?.('http://example.com')}>
                Load
            </button>
        );

        render(<EmptyChat {...defaultProps} apiKey="test-key" renderMenu={mockRenderMenu} />);

        fireEvent.click(screen.getByTestId('load-sample'));

        await waitFor(() => {
            const textarea = screen.getByTestId('chat-input-textarea');
            expect(textarea).toBeDisabled();
        });
    });

    // 10. URL guide
    it('should show URL guide when onShowUrlGuide is called', () => {
        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const showUrlGuideButton = screen.getByTestId('show-url-guide-button');
        fireEvent.click(showUrlGuideButton);

        expect(screen.getByTestId('url-guide')).toBeInTheDocument();
    });

    // 11. isComposing handling
    it('should not submit with Shift+Enter when isComposing is true', async () => {
        render(<EmptyChat {...defaultProps} apiKey="test-key" />);

        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'test' } });

        // Create a proper keyboard event with isComposing
        const keyDownEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(keyDownEvent, 'isComposing', {
            get() {
                return true;
            },
        });

        fireEvent(textarea, keyDownEvent);

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockSendMessage).not.toHaveBeenCalled();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import '@testing-library/jest-dom';
import ChatPanel from '../ChatPanel';
import chatReducer from '../../store/slices/chatSlice';
import duckdbReducer from '../../store/slices/duckdbSlice';
import dataReducer from '../../store/slices/dataSlice';
import mapReducer from '../../store/slices/mapSlice';

// Create mock functions
const mockSendMessage = vi.fn();
const mockMessages: any[] = [];
let mockIsLoading = false;

// Mock the useAIChat hook
vi.mock('../../features/chat/hooks/useAIChat', () => ({
  useAIChat: () => ({
    messages: mockMessages,
    isLoading: mockIsLoading,
    sendMessage: mockSendMessage,
  }),
}));

// Mock encryption utilities
vi.mock('../../utils/encryption', () => ({
  retrieveEncryptedApiKey: vi.fn().mockResolvedValue('sk-ant-test-key'),
}));

describe('ChatPanel', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock values
    mockMessages.length = 0;
    mockIsLoading = false;
    mockSendMessage.mockClear();
    
    store = configureStore({
      reducer: {
        chat: chatReducer,
        duckdb: duckdbReducer,
        data: dataReducer,
        map: mapReducer,
      },
    });
  });

  it('should render with initial state', async () => {
    render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // Wait for API key check to complete
    await waitFor(() => {
      expect(screen.getByText('GIS Data Analysis Chat')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/Ask about your data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collapse chat/i })).toBeInTheDocument();
  });

  it('should toggle collapse state', async () => {
    const { container } = render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // Wait for API key check to complete
    await waitFor(() => {
      expect(screen.getByText('GIS Data Analysis Chat')).toBeInTheDocument();
    });

    const collapseButton = screen.getByRole('button', { name: /collapse chat/i });
    const chatPanel = container.querySelector('.chat-panel');

    expect(chatPanel).not.toHaveClass('collapsed');

    // Click to collapse
    fireEvent.click(collapseButton);
    expect(chatPanel).toHaveClass('collapsed');
    expect(screen.getByRole('button', { name: /expand chat/i })).toBeInTheDocument();

    // Click to expand
    fireEvent.click(collapseButton);
    expect(chatPanel).not.toHaveClass('collapsed');
    expect(screen.getByRole('button', { name: /collapse chat/i })).toBeInTheDocument();
  });

  it('should handle form submission', async () => {
    render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('GIS Data Analysis Chat')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Ask about your data/i);
    const button = screen.getByRole('button', { name: /send/i });

    // Type and submit
    fireEvent.change(input, { target: { value: 'Test question' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Test question');
    });
  });

  it('should disable input and button when loading', async () => {
    // Set loading state
    mockIsLoading = true;
    
    render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('GIS Data Analysis Chat')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Ask about your data/i);
    const button = screen.getByRole('button', { name: /send/i });

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });

  it('should display messages', async () => {
    // Set messages
    mockMessages.push(
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there!' }
    );
    
    render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('GIS Data Analysis Chat')).toBeInTheDocument();
    });

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('should show welcome message when no messages', async () => {
    render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('GIS Data Analysis Chat')).toBeInTheDocument();
    });

    expect(screen.getByText('Welcome! 👋')).toBeInTheDocument();
    expect(screen.getByText(/I can help you analyze GIS data/i)).toBeInTheDocument();
  });
});

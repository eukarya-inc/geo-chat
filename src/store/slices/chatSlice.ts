import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    query?: string;
    visualization?: any;
    error?: string;
  };
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Omit<Message, 'id' | 'timestamp'>>) => {
      const message: Message = {
        ...action.payload,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      state.messages.push(message);
    },
    updateMessage: (state, action: PayloadAction<{ id: string; updates: Partial<Message> }>) => {
      const index = state.messages.findIndex(m => m.id === action.payload.id);
      if (index !== -1) {
        state.messages[index] = { ...state.messages[index], ...action.payload.updates };
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearMessages: (state) => {
      state.messages = [];
    },
  },
});

export const { addMessage, updateMessage, setLoading, setError, clearMessages } = chatSlice.actions;
export default chatSlice.reducer;

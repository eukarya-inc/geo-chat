import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  showApiKeyInput: boolean;
  isLoadingApiKey: boolean;
  apiKey: string;
  isSidebarOpen: boolean;
  activeTab: 'data' | 'map' | 'ai';
}

const initialState: UIState = {
  showApiKeyInput: true,
  isLoadingApiKey: true,
  apiKey: '',
  isSidebarOpen: true,
  activeTab: 'data',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setShowApiKeyInput: (state, action: PayloadAction<boolean>) => {
      state.showApiKeyInput = action.payload;
    },
    setIsLoadingApiKey: (state, action: PayloadAction<boolean>) => {
      state.isLoadingApiKey = action.payload;
    },
    setApiKey: (state, action: PayloadAction<string>) => {
      state.apiKey = action.payload;
    },
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setActiveTab: (state, action: PayloadAction<'data' | 'map' | 'ai'>) => {
      state.activeTab = action.payload;
    },
    reset: () => initialState,
  },
});

export const {
  setShowApiKeyInput,
  setIsLoadingApiKey,
  setApiKey,
  toggleSidebar,
  setActiveTab,
  reset,
} = uiSlice.actions;

export default uiSlice.reducer;
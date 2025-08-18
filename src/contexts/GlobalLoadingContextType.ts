import { createContext } from 'react';

export interface ChatLoadingState {
  isLoading: boolean;
  abortController: AbortController | null;
}

export interface GlobalLoadingContextType {
  isAnyLoading: boolean;
  registerLoading: (chatId: string, abortController: AbortController) => void;
  unregisterLoading: (chatId: string) => void;
  isLoading: (chatId: string) => boolean;
  getAbortController: (chatId: string) => AbortController | null;
}

export const GlobalLoadingContext = createContext<GlobalLoadingContextType | undefined>(undefined);
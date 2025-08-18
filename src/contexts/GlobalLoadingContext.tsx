import React, { useState, useCallback, useRef } from 'react';
import { GlobalLoadingContext, type ChatLoadingState } from './GlobalLoadingContextType';

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingStates, setLoadingStates] = useState<Map<string, ChatLoadingState>>(new Map());
  const loadingStatesRef = useRef<Map<string, ChatLoadingState>>(new Map());

  const registerLoading = useCallback((chatId: string, abortController: AbortController) => {
    setLoadingStates(prev => {
      const newMap = new Map(prev);
      newMap.set(chatId, { isLoading: true, abortController });
      loadingStatesRef.current = newMap;
      return newMap;
    });
  }, []);

  const unregisterLoading = useCallback((chatId: string) => {
    setLoadingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(chatId);
      loadingStatesRef.current = newMap;
      return newMap;
    });
  }, []);

  const isLoading = useCallback((chatId: string) => {
    return loadingStatesRef.current.get(chatId)?.isLoading || false;
  }, []);

  const getAbortController = useCallback((chatId: string) => {
    return loadingStatesRef.current.get(chatId)?.abortController || null;
  }, []);

  const isAnyLoading = loadingStates.size > 0;

  return (
    <GlobalLoadingContext.Provider value={{ 
      isAnyLoading, 
      registerLoading, 
      unregisterLoading,
      isLoading,
      getAbortController
    }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}
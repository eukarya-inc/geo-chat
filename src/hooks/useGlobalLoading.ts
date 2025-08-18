import { useContext } from 'react';
import { GlobalLoadingContext } from '../contexts/GlobalLoadingContextType';

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (!context) {
    throw new Error('useGlobalLoading must be used within a GlobalLoadingProvider');
  }
  return context;
}
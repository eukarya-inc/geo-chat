import { useEffect } from 'react';
import { useAppDispatch } from './store/hooks';
import { useInitializeDuckDB } from './hooks/useInitializeDuckDB';
import { 
  setApiKey, 
  setShowApiKeyInput, 
  setIsLoadingApiKey 
} from './store/slices/uiSlice';
import { retrieveEncryptedApiKey } from './utils/encryption';
import AppRedux from './AppRedux';

/**
 * Redux wrapper around the existing App component
 * This allows us to progressively migrate to Redux without breaking existing functionality
 */
function AppWithRedux() {
  const dispatch = useAppDispatch();
  // These will be used in PR2 when we migrate App component
  // const { apiKey, showApiKeyInput, isLoadingApiKey } = useAppSelector(state => state.ui);
  // const { db } = useInitializeDuckDB();
  // const { dbContext } = useAppSelector(state => state.duckdb);
  
  // For now, just initialize DuckDB in Redux store
  useInitializeDuckDB();

  // Initialize API key from storage
  useEffect(() => {
    const initializeApiKey = async () => {
      dispatch(setIsLoadingApiKey(true));
      try {
        const storedKey = await retrieveEncryptedApiKey();
        const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
        
        if (storedKey) {
          dispatch(setApiKey(storedKey));
          dispatch(setShowApiKeyInput(false));
        } else if (envKey) {
          dispatch(setApiKey(envKey));
          dispatch(setShowApiKeyInput(false));
        } else {
          dispatch(setShowApiKeyInput(true));
        }
      } catch (error) {
        console.error('Failed to load API key:', error);
        dispatch(setShowApiKeyInput(true));
      } finally {
        dispatch(setIsLoadingApiKey(false));
      }
    };
    
    initializeApiKey();
  }, [dispatch]);

  // Now using the Redux-aware App component
  return <AppRedux />;
}

export default AppWithRedux;
import { useState, useEffect } from 'react';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from '../../../utils/encryption';

// Hook for API key management
export function useApiKeyManagement() {
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);

    // Initialize API key from encrypted storage or environment variable
    useEffect(() => {
        const initializeApiKey = async () => {
            setIsLoadingApiKey(true);
            try {
                const storedKey = await retrieveEncryptedApiKey();
                const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

                if (storedKey) {
                    setApiKey(storedKey);
                    setShowApiKeyInput(false);
                } else if (envKey) {
                    setApiKey(envKey);
                    setShowApiKeyInput(false);
                } else {
                    setShowApiKeyInput(true);
                }
            } catch {
                setShowApiKeyInput(true);
            } finally {
                setIsLoadingApiKey(false);
            }
        };

        initializeApiKey();
    }, []);

    const saveApiKey = async (key: string) => {
        if (key.trim()) {
            try {
                // Save encrypted API key to localStorage
                await storeEncryptedApiKey(key.trim());
                setApiKey(key.trim());
                setShowApiKeyInput(false);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    };

    return {
        apiKey,
        setApiKey,
        showApiKeyInput,
        isLoadingApiKey,
        saveApiKey,
    };
}

// Hook for resizable areas
export function useResizableAreas() {
    const [sqlAreaHeight, setSqlAreaHeight] = useState(200);
    const [tableAreaHeight, setTableAreaHeight] = useState(300);

    return {
        sqlAreaHeight,
        setSqlAreaHeight,
        tableAreaHeight,
        setTableAreaHeight,
    };
}

// Re-export the split hooks for direct use if needed
export { useChatManagement } from './useChatManagement';
export { useSchemaManagement } from './useSchemaManagement';
export { useTableSelection } from './useTableSelection';
export { useMapVisualization } from './useMapVisualization';
export { useChartVisualization } from './useChartVisualization';
export { useMessageHandling } from './useMessageHandling';
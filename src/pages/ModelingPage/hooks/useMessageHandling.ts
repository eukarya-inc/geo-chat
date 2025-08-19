import { useCallback, useRef } from 'react';
import type { StructuredMessage } from '../../../types/message';

export function useMessageHandling(
    selectedChatId: string | null,
    updateChatMessages: (chatId: string, messages: StructuredMessage[]) => void
) {
    const sendMessageRef = useRef<((message: string) => void) | null>(null);

    // Handle send message ready callback
    const handleSendMessageReady = useCallback((sendFn: (message: string) => void) => {
        sendMessageRef.current = sendFn;
    }, []);

    // Special handler for Example button that sends both messages
    const handleExampleMessages = useCallback((tableMessage: string, followUpMessage: string) => {
        if (!sendMessageRef.current) return;
        
        // Send table message first (won't go to AI due to TABLE_CREATED marker)
        sendMessageRef.current(tableMessage);
        
        // Send follow-up message after a delay
        setTimeout(() => {
            if (sendMessageRef.current) {
                sendMessageRef.current(followUpMessage);
            }
        }, 300);
    }, []);

    // Create memoized callback for message updates
    const handleMessagesChange = useCallback((messages: StructuredMessage[]) => {
        if (selectedChatId) {
            updateChatMessages(selectedChatId, messages);
        }
    }, [selectedChatId, updateChatMessages]);

    return {
        sendMessageRef,
        handleSendMessageReady,
        handleExampleMessages,
        handleMessagesChange,
    };
}
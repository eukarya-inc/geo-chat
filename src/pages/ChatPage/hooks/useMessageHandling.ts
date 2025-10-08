import { useCallback, useRef } from 'react';
import type { StructuredMessage } from '../../../types/message';

export function useMessageHandling(selectedChatId: string | null, updateChatMessages: (chatId: string, messages: StructuredMessage[]) => void) {
    const sendMessageRef = useRef<((message: string) => void) | null>(null);

    // Handle send message ready callback
    const handleSendMessageReady = useCallback((sendFn: (message: string) => void) => {
        sendMessageRef.current = sendFn;
    }, []);

    // Create memoized callback for message updates
    const handleMessagesChange = useCallback(
        (messages: StructuredMessage[]) => {
            if (selectedChatId) {
                updateChatMessages(selectedChatId, messages);
            }
        },
        [selectedChatId, updateChatMessages]
    );

    return {
        sendMessageRef,
        handleSendMessageReady,
        handleMessagesChange,
    };
}

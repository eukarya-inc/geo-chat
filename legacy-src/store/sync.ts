import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef, useState, useCallback } from 'react';
import { remoteStateAtom, remoteStateForSyncAtom } from './remoteAtoms';

export function useStoreSync() {
    // Monitor remote state only
    const remoteState = useAtomValue(remoteStateForSyncAtom);
    const setRemoteState = useSetAtom(remoteStateAtom);
    const timer = useRef<number | null>(null);
    const lastSent = useRef<string>('');
    const [isDirty, setIsDirty] = useState(false);
    const currentPayloadRef = useRef<string>('');

    // Common sync logic
    const performSync = useCallback(async (payload: string) => {
        try {
            // Currently mock implementation (output to console)
            console.log('[StoreSync] Remote state synced:', JSON.parse(payload));

            // Replace with implementation like below in the future
            /*
      const res = await fetch('/api/modeling-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      */

            lastSent.current = payload;
            setIsDirty(false); // Clear dirty state after sync completes
        } catch (e) {
            console.error('[SyncBridge] Sync failed:', e);
            // Add retry strategy or toast notifications here
            // Maintain dirty state on error
        }
    }, []);

    // Function to sync immediately (used when chat completes etc.)
    const syncImmediately = useCallback(async () => {
        // Clear timer
        if (timer.current) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }

        const payload = currentPayloadRef.current || JSON.stringify(remoteState);

        // Don't send if same as last time
        if (payload === lastSent.current) {
            console.log('[SyncBridge] Immediate sync skipped - no changes');
            return;
        }

        console.log('[SyncBridge] Immediate sync triggered');
        await performSync(payload);
    }, [remoteState, performSync]);

    // Debounce for sending
    useEffect(() => {
        const payload = JSON.stringify(remoteState);
        currentPayloadRef.current = payload;

        if (payload === lastSent.current) return; // Don't send if same as last time (prevent loop)

        // Set dirty state when there are changes
        setIsDirty(true);

        // Debounce (3000ms = 3 seconds)
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            performSync(payload);
        }, 3000);

        return () => {
            if (timer.current) window.clearTimeout(timer.current);
        };
    }, [remoteState, performSync]);

    // Detect dirty state with beforeunload event
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                const message = 'You have unsaved changes. Are you sure you want to leave this page?';
                e.preventDefault();
                e.returnValue = message; // Chrome/Safari
                return message; // Firefox
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isDirty]);

    // For receiving (future WebSocket or Polling implementation)
    useEffect(() => {
        // Currently mock implementation
        console.log('[SyncBridge] Ready for receiving updates');

        // Future implementation example:
        /*
    const ws = new WebSocket('/api/ws');
    ws.onmessage = (event) => {
      const newState = JSON.parse(event.data);
      setRemoteState(newState);
    };
    return () => ws.close();
    */
    }, [setRemoteState]);

    return {
        syncImmediately,
        isDirty,
    };
}

import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef, useState, useCallback } from 'react';
import { remoteStateAtom, remoteStateForSyncAtom } from '../store/modelingRemoteAtoms';

export function useSyncBridge() {
  // リモート状態のみ監視
  const remoteState = useAtomValue(remoteStateForSyncAtom);
  const setRemoteState = useSetAtom(remoteStateAtom);
  const timer = useRef<number | null>(null);
  const lastSent = useRef<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const currentPayloadRef = useRef<string>('');

  // 同期処理の共通ロジック
  const performSync = useCallback(async (payload: string) => {
    try {
      // 現在はモック実装（コンソールに出力）
      console.log('[SyncBridge] Remote state synced:', JSON.parse(payload));
      
      // 将来的には以下のような実装に置き換え
      /*
      const res = await fetch('/api/modeling-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      */
      
      lastSent.current = payload;
      setIsDirty(false); // 同期完了後にdirty状態を解除
    } catch (e) {
      console.error('[SyncBridge] Sync failed:', e);
      // ここで再送戦略やトースト表示などを入れる
      // エラー時はdirty状態を維持
    }
  }, []);

  // 即座に同期を実行する関数（チャット完了時などに使用）
  const syncImmediately = useCallback(async () => {
    // タイマーをクリア
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }

    const payload = currentPayloadRef.current || JSON.stringify(remoteState);
    
    // 前回と同じなら送らない
    if (payload === lastSent.current) {
      console.log('[SyncBridge] Immediate sync skipped - no changes');
      return;
    }

    console.log('[SyncBridge] Immediate sync triggered');
    await performSync(payload);
  }, [remoteState, performSync]);

  // 送信用デバウンス
  useEffect(() => {
    const payload = JSON.stringify(remoteState);
    currentPayloadRef.current = payload;
    
    if (payload === lastSent.current) return; // 前回と同じなら送らない（ループ防止）

    // 変更があったらdirty状態にする
    setIsDirty(true);

    // デバウンス（3000ms = 3秒）
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      performSync(payload);
    }, 3000);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [remoteState, performSync]);

  // beforeunloadイベントでdirty状態を検知
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        const message = '保存されていない変更があります。このページを離れてもよろしいですか？';
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

  // 受信用（将来的にWebSocket or Polling実装）
  useEffect(() => {
    // 現在はモック実装
    console.log('[SyncBridge] Ready for receiving updates');
    
    // 将来的な実装例:
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
    isDirty
  };
}
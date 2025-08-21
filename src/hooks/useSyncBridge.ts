import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { remoteStateAtom, remoteStateForSyncAtom } from '../store/modelingRemoteAtoms';

export function useSyncBridge() {
  // リモート状態のみ監視
  const remoteState = useAtomValue(remoteStateForSyncAtom);
  const setRemoteState = useSetAtom(remoteStateAtom);
  const timer = useRef<number | null>(null);
  const lastSent = useRef<string>('');
  const [isDirty, setIsDirty] = useState(false);

  // 送信用デバウンス
  useEffect(() => {
    const payload = JSON.stringify(remoteState);
    if (payload === lastSent.current) return; // 前回と同じなら送らない（ループ防止）

    // 変更があったらdirty状態にする
    setIsDirty(true);

    // デバウンス（3000ms = 3秒）
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        // 現在はモック実装（コンソールに出力）
        console.log('[SyncBridge] Remote state synced:', remoteState);
        
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
    }, 3000);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [remoteState]);

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
}
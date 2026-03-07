import { useState, useEffect, useRef, useCallback } from 'react';
import { connectWebSocket } from './api';

interface UseRealtimeDataOptions<T> {
  channels: string[];
  loadFn: () => Promise<T>;
  intervalMs?: number;
  debounceMs?: number;
  onWsMessage?: (message: { channel: string; data: unknown }) => void;
}

export function useRealtimeData<T>(options: UseRealtimeDataOptions<T>) {
  const { channels, loadFn, intervalMs = 15000, debounceMs = 300, onWsMessage } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadFnRef = useRef(loadFn);
  const onWsMessageRef = useRef(onWsMessage);
  loadFnRef.current = loadFn;
  onWsMessageRef.current = onWsMessage;

  const load = useCallback(() => {
    loadFnRef.current().then(setData).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    load();
    const timer = setInterval(load, intervalMs);
    const socket = connectWebSocket((message) => {
      if (onWsMessageRef.current) {
        onWsMessageRef.current(message);
        return;
      }

      if (!channels.includes(message.channel)) return;

      if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          load();
        }, debounceMs);
      }
    });

    for (const ch of channels) {
      socket.subscribe(ch);
    }

    return () => {
      clearInterval(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const ch of channels) {
        socket.unsubscribe(ch);
      }
      socket.close();
    };
  }, [channels.join(','), intervalMs, debounceMs, load]);

  return { data, error, setData, reload: load };
}

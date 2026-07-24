import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_ECONOMICS_WS_URL ?? (
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/economics/stream`
    : 'ws://localhost/economics/stream'
);

interface WSMessage {
  type: string;
  data: unknown;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage;
        setLastMessage(data);
      } catch {
        // Invalid JSON
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback(
    (projects?: string[], agents?: string[]) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'subscribe', projects, agents }),
        );
      }
    },
    [],
  );

  return { connected, lastMessage, subscribe };
}

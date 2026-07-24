// =============================================================================
// Dashboard API client — REST + WebSocket
// =============================================================================

// Default to same-origin so requests flow through the dashboard's nginx /economics proxy.
// Override only when running the dashboard outside Docker for development.
const API_URL = import.meta.env.VITE_ECONOMICS_API_URL ?? '';
const WS_URL = import.meta.env.VITE_ECONOMICS_WS_URL ?? (
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/economics/stream`
    : 'ws://localhost/economics/stream'
);

export async function fetchAPI<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}/economics${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function createWebSocket(
  onMessage: (data: unknown) => void,
  onError?: (err: Event) => void,
): WebSocket {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      // Invalid JSON — ignore
    }
  };

  ws.onerror = (err) => {
    if (onError) onError(err);
  };

  // Auto-reconnect with exponential backoff
  ws.onclose = () => {
    setTimeout(() => {
      createWebSocket(onMessage, onError);
    }, 3000);
  };

  return ws;
}

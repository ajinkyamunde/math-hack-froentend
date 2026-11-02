/**
 * Realtime communication service.
 * Socket.IO has been retired in favor of Hono APIs and Server-Sent Events (SSE).
 */

export function disconnectSocket(): void {
  // Realtime cleanup handled by useCompetitionSocket EventSource lifecycle
}

export function getSocket(): { connected: boolean } {
  return { connected: false };
}

export async function emitWithAck<T>(_event: string, _payload: object): Promise<T> {
  throw new Error('Socket.IO is retired. Use standard Hono REST endpoints.');
}

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../services/apiClient';
import { competitionService } from '../../services/competitionService';

export type ConnectionState = 'connecting' | 'online' | 'offline';

const FALLBACK_POLL_INTERVAL_MS = 3000;

/**
 * Server-Sent Events (SSE) hook for real-time competition notifications.
 * Automatically handles connection, reconnections, event dispatching,
 * and graceful fallback polling if SSE is disconnected/unsupported.
 */
export function useCompetitionSocket<TState>(
  competitionId: string | undefined,
  enabled: boolean,
  handlers: Record<string, (payload: never) => void>,
  onJoined: (state: TState) => void,
  onJoinError?: (error: Error) => void,
): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const handlersRef = useRef(handlers);
  const joinedRef = useRef(onJoined);
  const errorRef = useRef(onJoinError);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const isUnlockedRef = useRef<boolean>(false);

  handlersRef.current = handlers;
  joinedRef.current = onJoined;
  errorRef.current = onJoinError;

  useEffect(() => {
    if (!competitionId || !enabled) {
      setConnection('offline');
      return undefined;
    }

    let isMounted = true;

    // Helper to stop fallback polling
    const stopPolling = () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    // Helper to start fallback polling only when locked and SSE is offline
    const startFallbackPolling = () => {
      if (pollTimerRef.current !== null || isUnlockedRef.current) return;
      pollTimerRef.current = window.setInterval(async () => {
        if (!isMounted || isUnlockedRef.current) {
          stopPolling();
          return;
        }
        try {
          const statusRes = await competitionService.status(competitionId);
          if (statusRes.status === 'ACTIVE' || statusRes.status === 'RUNNING') {
            isUnlockedRef.current = true;
            stopPolling();
            handlersRef.current['competition:started']?.({
              competitionId,
              status: 'ACTIVE',
              startedAt: statusRes.startedAt,
            } as never);
          }
        } catch {
          // ignore polling failure
        }
      }, FALLBACK_POLL_INTERVAL_MS);
    };

    // Construct SSE events URL
    const eventsUrl = `${API_BASE_URL}/api/competitions/${competitionId}/events`;

    try {
      const eventSource = new EventSource(eventsUrl, { withCredentials: true });
      esRef.current = eventSource;

      eventSource.onopen = () => {
        if (!isMounted) return;
        setConnection('online');
        stopPolling();
      };

      eventSource.addEventListener('connected', (e: MessageEvent) => {
        if (!isMounted) return;
        setConnection('online');
        stopPolling();
        try {
          const data = JSON.parse(e.data);
          if (data.status === 'ACTIVE' || data.status === 'RUNNING') {
            isUnlockedRef.current = true;
          }
          joinedRef.current(data);
        } catch (err) {
          errorRef.current?.(err as Error);
        }
      });

      eventSource.addEventListener('ping', () => {
        if (!isMounted) return;
        setConnection('online');
      });

      // Register custom event listeners from handlers
      const registeredEvents = Object.keys(handlersRef.current);
      const listenerMap = new Map<string, (e: MessageEvent) => void>();

      for (const event of registeredEvents) {
        const listener = (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            if (event === 'competition:started' || (event === 'competition:state' && (data.status === 'ACTIVE' || data.status === 'RUNNING'))) {
              isUnlockedRef.current = true;
              stopPolling();
            }
            handlersRef.current[event]?.(data as never);
          } catch {
            handlersRef.current[event]?.(e.data as never);
          }
        };
        listenerMap.set(event, listener);
        eventSource.addEventListener(event, listener);
      }

      eventSource.onerror = () => {
        if (!isMounted) return;
        setConnection('offline');
        // If SSE fails and competition is not yet unlocked, activate fallback polling
        startFallbackPolling();
      };
    } catch (err) {
      setConnection('offline');
      startFallbackPolling();
      errorRef.current?.(err as Error);
    }

    return () => {
      isMounted = false;
      stopPolling();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [competitionId, enabled]);

  return connection;
}

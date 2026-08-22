import { useEffect, useRef, useCallback } from 'react';
import { useVisibilityChange } from './useVisibilityChange';

/**
 * Options for configuring the conditional polling behavior.
 */
interface PollingOptions {
  /**
   * Whether polling is enabled. When false, polling will not start.
   * @default true
   */
  enabled?: boolean;
  
  /**
   * Maximum interval (in milliseconds) after exponential backoff.
   * Prevents the interval from growing indefinitely during repeated errors.
   * @default 300000 (5 minutes)
   */
  maxBackoffInterval?: number;
  
  /**
   * Multiplier applied to the interval after each error for exponential backoff.
   * @default 1.5
   */
  backoffMultiplier?: number;
}

/**
 * Custom React hook for intelligent polling that adapts to browser visibility and API errors.
 * 
 * Features:
 * - **Visibility-based pausing**: Automatically pauses polling when the browser tab becomes inactive
 *   and resumes when the tab becomes active again, reducing unnecessary API calls and server load.
 * - **Exponential backoff**: Implements exponential backoff when the callback throws errors,
 *   progressively increasing the polling interval up to a configurable maximum.
 * - **Error recovery**: Automatically resets the interval and error count when polling succeeds,
 *   allowing quick recovery from transient errors.
 * - **Proper cleanup**: Clears all timers on unmount to prevent memory leaks.
 * 
 * @param callback - Async function to call on each poll. Should throw an error if the API call fails.
 * @param interval - Base polling interval in milliseconds (e.g., 30000 for 30 seconds)
 * @param options - Optional configuration for polling behavior
 * 
 * @example
 * // Basic usage - polls every 30 seconds, pauses when tab is inactive
 * function ConversationView({ leadId }: { leadId: string }) {
 *   const fetchMessages = useCallback(async () => {
 *     const res = await fetch(`/api/leads/${leadId}/messages`);
 *     if (!res.ok) throw new Error('Failed to fetch messages');
 *     const data = await res.json();
 *     setMessages(data.messages);
 *   }, [leadId]);
 * 
 *   useConditionalPolling(fetchMessages, 30000);
 * 
 *   return <div>{...}</div>;
 * }
 * 
 * @example
 * // With custom configuration
 * function NotificationsProvider() {
 *   const fetchNotifications = useCallback(async () => {
 *     const res = await fetch('/api/notifications');
 *     if (!res.ok) throw new Error('Failed to fetch notifications');
 *     const data = await res.json();
 *     setNotifications(data);
 *   }, []);
 * 
 *   useConditionalPolling(fetchNotifications, 45000, {
 *     enabled: true,
 *     maxBackoffInterval: 600000, // 10 minutes
 *     backoffMultiplier: 2,
 *   });
 * 
 *   return <div>{...}</div>;
 * }
 * 
 * @example
 * // Conditional enabling
 * function DashboardUpdates() {
 *   const [autoRefresh, setAutoRefresh] = useState(true);
 *   
 *   useConditionalPolling(fetchUpdates, 45000, {
 *     enabled: autoRefresh, // User can toggle auto-refresh
 *   });
 * 
 *   return (
 *     <div>
 *       <button onClick={() => setAutoRefresh(!autoRefresh)}>
 *         Toggle Auto-Refresh
 *       </button>
 *     </div>
 *   );
 * }
 */
export function useConditionalPolling(
  callback: () => Promise<void>,
  interval: number,
  options: PollingOptions = {}
): void {
  const {
    enabled = true,
    maxBackoffInterval = 300000, // 5 minutes
    backoffMultiplier = 1.5,
  } = options;

  const isVisible = useVisibilityChange();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentIntervalRef = useRef(interval);
  const errorCountRef = useRef(0);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // Don't start polling if disabled or tab is not visible
    if (!enabled || !isVisible) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    /**
     * Execute the polling callback with error handling and exponential backoff logic.
     */
    const poll = async () => {
      try {
        await callbackRef.current();
        // Success: reset error count and interval to base value
        errorCountRef.current = 0;
        currentIntervalRef.current = interval;
      } catch (error) {
        // Error: increment count and apply exponential backoff
        errorCountRef.current += 1;
        const backoffInterval = Math.min(
          interval * Math.pow(backoffMultiplier, errorCountRef.current),
          maxBackoffInterval
        );
        currentIntervalRef.current = backoffInterval;
        console.warn(
          `Polling error (attempt ${errorCountRef.current}), backing off to ${backoffInterval}ms:`,
          error
        );
      }
    };

    // Schedule next poll recursively
    const scheduleNextPoll = () => {
      poll().then(() => {
        // After poll completes, schedule the next one with current interval
        timerRef.current = setTimeout(scheduleNextPoll, currentIntervalRef.current);
      });
    };

    // Start polling immediately
    scheduleNextPoll();

    // Cleanup: clear timeout on unmount or when dependencies change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, isVisible, interval, backoffMultiplier, maxBackoffInterval]);

  // Additional cleanup on unmount to ensure no timers are left running
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}


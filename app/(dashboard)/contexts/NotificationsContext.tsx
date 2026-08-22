'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useConditionalPolling } from '@/lib/hooks/useConditionalPolling';

interface Notification {
  id: string;
  type: string;
  message: string;
  leadId: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/**
 * Provider for real-time notification state.
 * 
 * This context manages notification data with intelligent polling that:
 * - Polls every 45 seconds (increased from 15s for better performance)
 * - Automatically pauses when the browser tab is inactive
 * - Resumes when the tab becomes active again
 * - Implements exponential backoff on errors
 * 
 * Performance: Uses useConditionalPolling to reduce unnecessary API calls
 * and prevent polling when the user isn't actively viewing the tab.
 */
export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch('/api/notifications');
    if (!res.ok) throw new Error('Failed to fetch notifications');
    const data = await res.json();
    setNotifications(data.notifications || []);
  }, []);

  // Smart polling: 45-second interval, pauses on tab inactive, backs off on errors
  useConditionalPolling(fetchNotifications, 45000);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update: mark as read immediately in UI
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      
      if (!res.ok) {
        // Rollback on failure
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
        console.error('Failed to mark notification as read');
      }
    } catch (error) {
      // Rollback on error
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic update: mark all as read immediately
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    try {
      await Promise.all(
        unreadIds.map(id =>
          fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
        )
      );
    } catch (error) {
      // Refresh on error to get accurate state from server
      console.error('Error marking all notifications as read:', error);
      fetchNotifications();
    }
  }, [notifications, fetchNotifications]);

  // Memoize unreadCount to avoid recalculation on every render
  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  // CRITICAL: Memoize the context value to maintain referential equality
  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      refresh: fetchNotifications,
    }),
    [notifications, unreadCount, markAsRead, markAllAsRead, fetchNotifications]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

/**
 * Hook to access notifications from context.
 * Must be used within NotificationsProvider.
 * 
 * @returns {NotificationsContextValue} The notifications context value
 * @throws {Error} If used outside of NotificationsProvider
 * 
 * @example
 * function NotificationBell() {
 *   const { notifications, unreadCount, markAsRead } = useNotifications();
 *   
 *   return (
 *     <button>
 *       Notifications {unreadCount > 0 && `(${unreadCount})`}
 *     </button>
 *   );
 * }
 */
export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
};

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

export interface Inbox {
  id: string;
  provider: string;
  emailAddress: string;
  status: string;
  dailySendingCap: number;
  warmupThrottle: boolean;
  sentToday: number;
  sentDate: string | null;
  createdAt: string;
}

interface InboxSettings {
  dailySendingCap: number;
  warmupThrottle: boolean;
}

interface InboxesContextValue {
  // Data
  inboxes: Inbox[] | null;
  loading: boolean;
  error: Error | null;
  
  // Actions
  fetchInboxes: () => Promise<void>;
  disconnectInbox: (inboxId: string) => Promise<void>;
  updateInboxSettings: (inboxId: string, settings: InboxSettings) => Promise<void>;
  refreshInboxes: () => Promise<void>;
  clearCache: () => void;
}

const InboxesContext = createContext<InboxesContextValue | undefined>(undefined);

/**
 * InboxesContext Provider
 * 
 * Manages inbox connections with intelligent caching:
 * - Fetches inboxes only when cache is empty
 * - Updates cache after mutations (disconnect, update settings)
 * - Prevents redundant API calls on re-renders
 * 
 * Usage pattern:
 * 1. Component checks if inboxes exist in context
 * 2. If exists: use cached data
 * 3. If empty: call fetchInboxes() which makes API call and caches result
 * 4. After mutations: context automatically updates cache
 */
export const InboxesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [inboxes, setInboxes] = useState<Inbox[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch inboxes from API with caching logic
   * - Only fetches if cache is empty
   * - Updates cache after successful fetch
   */
  const fetchInboxes = useCallback(async () => {
    // Cache hit: return immediately if we already have data
    if (inboxes !== null) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/inboxes');
      
      if (!res.ok) {
        throw new Error('Failed to fetch inboxes');
      }

      const data = await res.json();
      
      // Update cache
      setInboxes(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      toast.error('Failed to load inboxes');
    } finally {
      setLoading(false);
    }
  }, [inboxes]);

  /**
   * Disconnect an inbox and update cache
   * - Removes inbox from cached data
   * - No need to re-fetch entire list
   */
  const disconnectInbox = useCallback(async (inboxId: string) => {
    try {
      const res = await fetch(`/api/inboxes/${inboxId}`, { method: 'DELETE' });
      
      if (!res.ok) {
        throw new Error('Failed to disconnect inbox');
      }

      // Update cache: remove disconnected inbox
      setInboxes((prev) => {
        if (!prev) return null;
        return prev.filter((inbox) => inbox.id !== inboxId);
      });

      toast.success('Inbox disconnected successfully');
    } catch (err) {
      toast.error('Failed to disconnect inbox');
      throw err;
    }
  }, []);

  /**
   * Update inbox settings and update cache
   * - Updates settings in cached data
   * - No need to re-fetch
   */
  const updateInboxSettings = useCallback(async (inboxId: string, settings: InboxSettings) => {
    try {
      const res = await fetch(`/api/inboxes/${inboxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      
      if (!res.ok) {
        throw new Error('Failed to update inbox settings');
      }

      // Update cache: merge settings into inbox
      setInboxes((prev) => {
        if (!prev) return null;
        return prev.map((inbox) =>
          inbox.id === inboxId ? { ...inbox, ...settings } : inbox
        );
      });

      toast.success('Settings updated successfully');
    } catch (err) {
      toast.error('Failed to update settings');
      throw err;
    }
  }, []);

  /**
   * Refresh inboxes
   * - Force re-fetch from API
   */
  const refreshInboxes = useCallback(async () => {
    // Force refresh by clearing cache first
    setInboxes(null);
    await fetchInboxes();
  }, [fetchInboxes]);

  /**
   * Clear cache
   * - Useful when navigating away or when data becomes stale
   */
  const clearCache = useCallback(() => {
    setInboxes(null);
    setError(null);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<InboxesContextValue>(
    () => ({
      inboxes,
      loading,
      error,
      fetchInboxes,
      disconnectInbox,
      updateInboxSettings,
      refreshInboxes,
      clearCache,
    }),
    [inboxes, loading, error, fetchInboxes, disconnectInbox, updateInboxSettings, refreshInboxes, clearCache]
  );

  return <InboxesContext.Provider value={value}>{children}</InboxesContext.Provider>;
};

/**
 * Hook to access inboxes context
 * Must be used within InboxesProvider
 */
export const useInboxes = () => {
  const context = useContext(InboxesContext);
  if (!context) {
    throw new Error('useInboxes must be used within InboxesProvider');
  }
  return context;
};

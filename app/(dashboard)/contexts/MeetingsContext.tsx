'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface Meeting {
  id: string;
  scheduledTime: string;
  duration: number;
  meetingProvider: string;
  meetingLink: string | null;
  status: string;
  lead: {
    id: string;
    companyName: string;
    email: string;
  };
}

interface MeetingsContextValue {
  // Data
  meetings: Meeting[] | null;
  loading: boolean;
  error: Error | null;
  
  // Actions
  fetchMeetings: () => Promise<void>;
  refreshMeetings: () => Promise<void>;
  clearCache: () => void;
}

const MeetingsContext = createContext<MeetingsContextValue | undefined>(undefined);

/**
 * MeetingsContext Provider
 * 
 * Manages upcoming meetings with caching:
 * - Fetches meetings only when cache is empty
 * - Prevents redundant API calls on dashboard visits
 * - Updates cache automatically
 */
export const MeetingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch meetings from API with caching logic
   * - Only fetches if cache is empty
   * - Updates cache after successful fetch
   */
  const fetchMeetings = useCallback(async () => {
    // Cache hit: return immediately if we already have data
    if (meetings !== null) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/meetings');
      
      if (!res.ok) {
        throw new Error('Failed to fetch meetings');
      }

      const data = await res.json();
      
      // Update cache
      setMeetings(data.meetings || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      // Don't show toast for meetings as it's not critical
      console.error('Failed to load meetings:', error);
    } finally {
      setLoading(false);
    }
  }, [meetings]);

  /**
   * Refresh meetings
   * - Force re-fetch from API
   */
  const refreshMeetings = useCallback(async () => {
    // Force refresh by clearing cache first
    setMeetings(null);
    await fetchMeetings();
  }, [fetchMeetings]);

  /**
   * Clear cache
   * - Useful when navigating away or when data becomes stale
   */
  const clearCache = useCallback(() => {
    setMeetings(null);
    setError(null);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<MeetingsContextValue>(
    () => ({
      meetings,
      loading,
      error,
      fetchMeetings,
      refreshMeetings,
      clearCache,
    }),
    [meetings, loading, error, fetchMeetings, refreshMeetings, clearCache]
  );

  return <MeetingsContext.Provider value={value}>{children}</MeetingsContext.Provider>;
};

/**
 * Hook to access meetings context
 * Must be used within MeetingsProvider
 */
export const useMeetings = () => {
  const context = useContext(MeetingsContext);
  if (!context) {
    throw new Error('useMeetings must be used within MeetingsProvider');
  }
  return context;
};

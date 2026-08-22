'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

export interface OutreachType {
  id: string;
  name: string;
  systemPrompt?: string;
  exampleEmails?: string[];
  sequenceSteps?: { stepNumber: number; delayDays: number }[];
  active?: boolean;
  createdAt?: string;
  _count?: { leads: number };
}

interface OutreachTypesContextValue {
  // Data
  outreachTypes: OutreachType[] | null;
  loading: boolean;
  error: Error | null;
  
  // Actions
  fetchOutreachTypes: () => Promise<void>;
  addOutreachType: (type: OutreachType) => void;
  updateOutreachType: (id: string, updates: Partial<OutreachType>) => void;
  deleteOutreachType: (id: string) => void;
  refreshOutreachTypes: () => Promise<void>;
  clearCache: () => void;
}

const OutreachTypesContext = createContext<OutreachTypesContextValue | undefined>(undefined);

/**
 * OutreachTypesContext Provider
 * 
 * Manages outreach types with intelligent caching:
 * - Fetches once and caches
 * - Updates cache on mutations (create, update, delete)
 * - Prevents redundant API calls on re-renders
 */
export const OutreachTypesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [outreachTypes, setOutreachTypes] = useState<OutreachType[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch outreach types from API with caching logic
   * - Only fetches if cache is empty
   * - Updates cache after successful fetch
   */
  const fetchOutreachTypes = useCallback(async () => {
    // Cache hit: return immediately if we already have data
    if (outreachTypes !== null) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/outreach-types');
      
      if (!res.ok) {
        throw new Error('Failed to fetch outreach types');
      }

      const data = await res.json();
      
      // Update cache
      setOutreachTypes(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      toast.error('Failed to load outreach types');
    } finally {
      setLoading(false);
    }
  }, [outreachTypes]);

  /**
   * Add new outreach type to cache
   * Call after creating a new type via API
   */
  const addOutreachType = useCallback((type: OutreachType) => {
    setOutreachTypes((prev) => {
      if (!prev) return [type];
      return [...prev, type];
    });
  }, []);

  /**
   * Update outreach type in cache
   * Call after updating a type via API
   */
  const updateOutreachType = useCallback((id: string, updates: Partial<OutreachType>) => {
    setOutreachTypes((prev) => {
      if (!prev) return null;
      return prev.map((type) =>
        type.id === id ? { ...type, ...updates } : type
      );
    });
  }, []);

  /**
   * Delete outreach type from cache
   * Call after deleting a type via API
   */
  const deleteOutreachType = useCallback((id: string) => {
    setOutreachTypes((prev) => {
      if (!prev) return null;
      return prev.filter((type) => type.id !== id);
    });
  }, []);

  /**
   * Refresh outreach types
   * - Force re-fetch from API
   */
  const refreshOutreachTypes = useCallback(async () => {
    // Force refresh by clearing cache first
    setOutreachTypes(null);
    await fetchOutreachTypes();
  }, [fetchOutreachTypes]);

  /**
   * Clear cache
   */
  const clearCache = useCallback(() => {
    setOutreachTypes(null);
    setError(null);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<OutreachTypesContextValue>(
    () => ({
      outreachTypes,
      loading,
      error,
      fetchOutreachTypes,
      addOutreachType,
      updateOutreachType,
      deleteOutreachType,
      refreshOutreachTypes,
      clearCache,
    }),
    [outreachTypes, loading, error, fetchOutreachTypes, addOutreachType, updateOutreachType, deleteOutreachType, refreshOutreachTypes, clearCache]
  );

  return <OutreachTypesContext.Provider value={value}>{children}</OutreachTypesContext.Provider>;
};

/**
 * Hook to access outreach types context
 * Must be used within OutreachTypesProvider
 */
export const useOutreachTypes = () => {
  const context = useContext(OutreachTypesContext);
  if (!context) {
    throw new Error('useOutreachTypes must be used within OutreachTypesProvider');
  }
  return context;
};

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

export interface Lead {
  id: string;
  companyName: string;
  email: string;
  country: string;
  status: string;
  replyTag: string | null;
  currentStep: number;
  source: string;
  preferredTime: string;
  createdAt: string;
  outreachType: { id: string; name: string } | null;
}

interface LeadsPaginationData {
  leads: Lead[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface LeadsFilter {
  status?: string;
  outreachTypeId?: string;
  country?: string;
  source?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface LeadsContextValue {
  // Data
  leadsData: LeadsPaginationData | null;
  loading: boolean;
  error: Error | null;
  
  // Actions
  fetchLeads: (filters?: LeadsFilter) => Promise<void>;
  deleteLead: (leadId: string) => Promise<void>;
  refreshLeads: () => Promise<void>;
  
  // Cache management
  clearCache: () => void;
}

const LeadsContext = createContext<LeadsContextValue | undefined>(undefined);

/**
 * LeadsContext Provider
 * 
 * Manages leads data with intelligent caching:
 * - Fetches leads from API only when cache is empty or filters change
 * - Updates cache after mutations (create/update/delete)
 * - Prevents redundant API calls on re-renders
 * 
 * Usage pattern:
 * 1. Component checks if leadsData exists in context
 * 2. If exists: use cached data
 * 3. If empty: call fetchLeads() which makes API call and caches result
 * 4. After mutations: context automatically updates cache
 */
export const LeadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [leadsData, setLeadsData] = useState<LeadsPaginationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentFilters, setCurrentFilters] = useState<LeadsFilter | null>(null);

  /**
   * Fetch leads from API with caching logic
   * - Only fetches if filters changed or cache is empty
   * - Updates cache after successful fetch
   */
  const fetchLeads = useCallback(async (filters: LeadsFilter = {}) => {
    // Check if we already have data for these filters (simple cache check)
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(currentFilters);
    
    if (!filtersChanged && leadsData) {
      // Cache hit: return immediately without API call
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(filters.page || 1),
        pageSize: String(filters.pageSize || 20),
        sortBy: filters.sortBy || 'createdAt',
        sortOrder: filters.sortOrder || 'desc',
      });

      if (filters.status) params.set('status', filters.status);
      if (filters.outreachTypeId) params.set('outreachTypeId', filters.outreachTypeId);
      if (filters.country) params.set('country', filters.country);
      if (filters.source) params.set('source', filters.source);

      const res = await fetch(`/api/leads?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch leads');
      }

      const data = await res.json();
      
      // Update cache
      setLeadsData(data);
      setCurrentFilters(filters);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [currentFilters, leadsData]);

  /**
   * Delete a lead and update cache
   * - Removes lead from cached data
   * - No need to re-fetch entire list
   */
  const deleteLead = useCallback(async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      
      if (!res.ok) {
        throw new Error('Failed to delete lead');
      }

      // Update cache: remove deleted lead
      setLeadsData((prev) => {
        if (!prev) return null;
        
        return {
          ...prev,
          leads: prev.leads.filter((lead) => lead.id !== leadId),
          pagination: {
            ...prev.pagination,
            total: prev.pagination.total - 1,
          },
        };
      });

      toast.success('Lead deleted successfully');
    } catch (err) {
      toast.error('Failed to delete lead');
      throw err;
    }
  }, []);

  /**
   * Refresh leads with current filters
   * - Force re-fetch from API
   */
  const refreshLeads = useCallback(async () => {
    if (currentFilters) {
      // Force refresh by clearing cache first
      setLeadsData(null);
      await fetchLeads(currentFilters);
    }
  }, [currentFilters, fetchLeads]);

  /**
   * Clear cache
   * - Useful when navigating away or when data becomes stale
   */
  const clearCache = useCallback(() => {
    setLeadsData(null);
    setCurrentFilters(null);
    setError(null);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<LeadsContextValue>(
    () => ({
      leadsData,
      loading,
      error,
      fetchLeads,
      deleteLead,
      refreshLeads,
      clearCache,
    }),
    [leadsData, loading, error, fetchLeads, deleteLead, refreshLeads, clearCache]
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
};

/**
 * Hook to access leads context
 * Must be used within LeadsProvider
 */
export const useLeads = () => {
  const context = useContext(LeadsContext);
  if (!context) {
    throw new Error('useLeads must be used within LeadsProvider');
  }
  return context;
};

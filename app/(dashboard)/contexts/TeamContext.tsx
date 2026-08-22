'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  user: { name: string; email: string };
}

interface TeamContextValue {
  // Data
  members: TeamMember[] | null;
  invitations: Invitation[] | null;
  activity: ActivityLog[] | null;
  loading: boolean;
  error: Error | null;
  
  // Actions
  fetchTeam: () => Promise<void>;
  addMember: (member: TeamMember) => void;
  updateMemberRole: (userId: string, role: string) => void;
  removeMember: (userId: string) => void;
  addInvitation: (invitation: Invitation) => void;
  refreshTeam: () => Promise<void>;
  clearCache: () => void;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

/**
 * TeamContext Provider
 * 
 * Manages team data with intelligent caching:
 * - Fetches team/invitations/activity once and caches
 * - Updates cache on mutations (role changes, invites, removals)
 * - Prevents redundant API calls on tab revisits
 */
export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [activity, setActivity] = useState<ActivityLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch team data from API with caching logic
   * - Only fetches if cache is empty
   * - Updates cache after successful fetch
   */
  const fetchTeam = useCallback(async () => {
    // Cache hit: return immediately if we already have data
    if (members !== null && invitations !== null && activity !== null) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [teamRes, activityRes] = await Promise.all([
        fetch('/api/team'),
        fetch('/api/team/activity'),
      ]);

      if (teamRes.ok) {
        const data = await teamRes.json();
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      }

      if (activityRes.ok) {
        const data = await activityRes.json();
        setActivity(data.logs || []);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      console.error('Failed to load team data:', error);
    } finally {
      setLoading(false);
    }
  }, [members, invitations, activity]);

  /**
   * Add new team member to cache
   */
  const addMember = useCallback((member: TeamMember) => {
    setMembers((prev) => {
      if (!prev) return [member];
      return [...prev, member];
    });
  }, []);

  /**
   * Update team member role in cache
   */
  const updateMemberRole = useCallback((userId: string, role: string) => {
    setMembers((prev) => {
      if (!prev) return null;
      return prev.map((member) =>
        member.id === userId ? { ...member, role } : member
      );
    });
  }, []);

  /**
   * Remove team member from cache
   */
  const removeMember = useCallback((userId: string) => {
    setMembers((prev) => {
      if (!prev) return null;
      return prev.filter((member) => member.id !== userId);
    });
  }, []);

  /**
   * Add new invitation to cache
   */
  const addInvitation = useCallback((invitation: Invitation) => {
    setInvitations((prev) => {
      if (!prev) return [invitation];
      return [...prev, invitation];
    });
  }, []);

  /**
   * Refresh team data
   * - Force re-fetch from API
   */
  const refreshTeam = useCallback(async () => {
    // Force refresh by clearing cache first
    setMembers(null);
    setInvitations(null);
    setActivity(null);
    await fetchTeam();
  }, [fetchTeam]);

  /**
   * Clear cache
   */
  const clearCache = useCallback(() => {
    setMembers(null);
    setInvitations(null);
    setActivity(null);
    setError(null);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<TeamContextValue>(
    () => ({
      members,
      invitations,
      activity,
      loading,
      error,
      fetchTeam,
      addMember,
      updateMemberRole,
      removeMember,
      addInvitation,
      refreshTeam,
      clearCache,
    }),
    [members, invitations, activity, loading, error, fetchTeam, addMember, updateMemberRole, removeMember, addInvitation, refreshTeam, clearCache]
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

/**
 * Hook to access team context
 * Must be used within TeamProvider
 */
export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error('useTeam must be used within TeamProvider');
  }
  return context;
};

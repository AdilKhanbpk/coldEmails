'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  plan: string | null;
  status: string | null;
}

interface UserContextValue {
  user: User | null;
  loading: boolean;
  error: Error | null;
  updateUser: (updates: Partial<User>) => Promise<void>;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

/**
 * Provider for authenticated user data and preferences.
 * 
 * This context manages user profile data, role, and subscription state.
 * It's placed at the top of the provider hierarchy since authentication
 * data is needed by many downstream features.
 * 
 * Performance: The context value is memoized to prevent unnecessary re-renders.
 * User data changes infrequently, so this context rarely triggers updates.
 */
export const UserProvider: React.FC<{ 
  children: React.ReactNode;
  initialUser?: User | null; 
}> = ({ children, initialUser = null }) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/profile');
      if (!res.ok) throw new Error('Failed to fetch user profile');
      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      console.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch if we don't have initial user data
    if (!initialUser) {
      fetchUser();
    }
  }, [initialUser, fetchUser]);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;

    // Optimistic update
    const previousUser = user;
    setUser({ ...user, ...updates });

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        // Rollback on failure
        setUser(previousUser);
        throw new Error('Failed to update user profile');
      }

      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      // Rollback on error
      setUser(previousUser);
      console.error('Error updating user profile:', err);
      throw err;
    }
  }, [user]);

  // CRITICAL: Memoize the context value to prevent re-renders
  const value = useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      error,
      updateUser,
      refresh: fetchUser,
    }),
    [user, loading, error, updateUser, fetchUser]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

/**
 * Hook to access user data from context.
 * Must be used within UserProvider.
 * 
 * @returns {UserContextValue} The user context value
 * @throws {Error} If used outside of UserProvider
 * 
 * @example
 * function UserProfile() {
 *   const { user, updateUser } = useUser();
 *   
 *   if (!user) return null;
 *   
 *   return (
 *     <div>
 *       <h2>{user.name}</h2>
 *       <p>Role: {user.role}</p>
 *     </div>
 *   );
 * }
 */
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};

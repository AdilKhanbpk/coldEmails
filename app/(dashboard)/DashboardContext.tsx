// Context for shared dashboard data (outreach types, inbox count, etc.)
'use client';

/**
 * @deprecated This context has been split into focused contexts for better performance.
 * 
 * Migration guide:
 * - For outreach types: Use `useOutreachTypes()` from './contexts/OutreachTypesContext'
 * - For notifications: Use `useNotifications()` from './contexts/NotificationsContext'
 * - For user data: Use `useUser()` from './contexts/UserContext'
 * 
 * The old DashboardContext caused excessive re-renders because any change to any
 * part of the context triggered re-renders in ALL consuming components. The new
 * focused contexts ensure components only re-render when their specific data changes.
 * 
 * This file is kept temporarily for backward compatibility during migration.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface OutreachType {
    id: string;
    name: string;
}

interface DashboardContextProps {
    outreachTypes: OutreachType[];
    setOutreachTypes: React.Dispatch<React.SetStateAction<OutreachType[]>>;
    // Add more shared state here as needed
}

const DashboardContext = createContext<DashboardContextProps | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [outreachTypes, setOutreachTypes] = useState<OutreachType[]>([]);

    // Fetch outreach types once on client mount
    useEffect(() => {
        const fetchOutreachTypes = async () => {
            try {
                const res = await fetch('/api/outreach-types');
                if (!res.ok) throw new Error('Failed to fetch outreach types');
                const data = await res.json();
                setOutreachTypes(data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchOutreachTypes();
    }, []);

    return (
        <DashboardContext.Provider value={{ outreachTypes, setOutreachTypes }}>
            {children}
        </DashboardContext.Provider>
    );
};

export const useDashboard = () => {
    const ctx = useContext(DashboardContext);
    if (!ctx) {
        throw new Error('useDashboard must be used within DashboardProvider');
    }
    return ctx;
};

// Context for shared dashboard data (outreach types, inbox count, etc.)
'use client';

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

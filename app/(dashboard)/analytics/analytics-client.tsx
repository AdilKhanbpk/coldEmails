'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Eye, MousePointerClick, Reply, Calendar, TrendingUp, Filter } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Funnel, FunnelChart, LabelList,
} from 'recharts';
import { format } from 'date-fns';
import { useOutreachTypes } from '@/app/(dashboard)/contexts/OutreachTypesContext';
import { useAnalytics } from '@/app/(dashboard)/contexts/AnalyticsContext';
import type { OutreachType } from '@/app/(dashboard)/contexts/OutreachTypesContext';


interface AnalyticsData {
  metrics: {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalReplied: number;
    totalBounced: number;
    totalMeetings: number;
    totalLeads: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
  };
  sendsData: { date: string; sends: number; opens: number; replies: number }[];
  replyByType: { name: string; replyRate: number; total: number; replied: number }[];
  funnel: { sent: number; opened: number; replied: number; meetingBooked: number };
}

export function AnalyticsClient() {
  const { outreachTypes } = useOutreachTypes();
  const { 
    rawData,
    loading, 
    fetchAnalytics: contextFetchAnalytics,
    getFilteredData,
    refreshAnalytics 
  } = useAnalytics();
  
  const [outreachTypeId, setOutreachTypeId] = useState('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Fetch analytics when outreach type changes (new data needed)
  // Always fetch 90d range to enable client-side date filtering
  useEffect(() => {
    contextFetchAnalytics('90d', outreachTypeId);
  }, [outreachTypeId, contextFetchAnalytics]);

  // Get filtered data (CLIENT-SIDE date filtering only)
  // Note: OutreachType filtering happens via API call (useEffect above)
  const data = useMemo(() => {
    if (!rawData) return null;
    
    // Get data from context (already filtered by outreach type via API)
    const baseData = {
      metrics: rawData.metrics,
      sendsData: rawData.sendsData,
      replyByType: rawData.replyByType,
      funnel: rawData.funnel,
    };
    
    // Apply CLIENT-SIDE date range filtering
    if (dateRange !== '90d' && baseData.sendsData) {
      const days = dateRange === '7d' ? 7 : 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const filteredSendsData = baseData.sendsData.filter((point) => {
        const pointDate = new Date(point.date);
        return pointDate >= cutoffDate;
      });
      
      return {
        ...baseData,
        sendsData: filteredSendsData,
      };
    }
    
    return baseData;
  }, [rawData, dateRange]);

  const metricCards = [
    { label: 'Emails Sent', value: data?.metrics.totalSent ?? 0, icon: Mail },
    { label: 'Open Rate', value: `${data?.metrics.openRate ?? 0}%`, icon: Eye },
    { label: 'Click Rate', value: `${data?.metrics.clickRate ?? 0}%`, icon: MousePointerClick },
    { label: 'Reply Rate', value: `${data?.metrics.replyRate ?? 0}%`, icon: Reply },
    { label: 'Meetings Booked', value: data?.metrics.totalMeetings ?? 0, icon: Calendar },
    { label: 'Bounce Rate', value: `${data?.metrics.bounceRate ?? 0}%`, icon: TrendingUp },
  ];

  const funnelData = data
    ? [
      { name: 'Sent', value: data.funnel.sent, fill: '#3b82f6' },
      { name: 'Opened', value: data.funnel.opened, fill: '#60a5fa' },
      { name: 'Replied', value: data.funnel.replied, fill: '#93c5fd' },
      { name: 'Meeting', value: data.funnel.meetingBooked, fill: '#bfdbfe' },
    ]
    : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">Track your outreach performance and engagement metrics.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-500">Filters:</span>
        </div>
        <Select value={dateRange} onValueChange={(value) => setDateRange(value as '7d' | '30d' | '90d')}>
          <SelectTrigger className="w-[140px] border-gray-200">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={outreachTypeId} onValueChange={setOutreachTypeId}>
          <SelectTrigger className="w-[200px] border-gray-200">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outreach Types</SelectItem>
            {(outreachTypes || []).map((ot: OutreachType) => (
              <SelectItem key={ot.id} value={ot.id}>{ot.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={refreshAnalytics} disabled={loading} className="border-gray-200">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            {metricCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="border-gray-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{card.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Sends Over Time */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Sends, Opens & Replies Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.sendsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(new Date(d), 'MMM d')}
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    labelFormatter={(d) => format(new Date(d), 'MMM d, yyyy')}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="sends" stroke="#3b82f6" strokeWidth={2} dot={false} name="Sends" />
                  <Line type="monotone" dataKey="opens" stroke="#93c5fd" strokeWidth={2} dot={false} name="Opens" />
                  <Line type="monotone" dataKey="replies" stroke="#1e40af" strokeWidth={2} dot={false} name="Replies" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Reply Rate by Outreach Type */}
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Reply Rate by Outreach Type</CardTitle>
              </CardHeader>
              <CardContent>
                {data.replyByType.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No outreach types yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.replyByType} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} unit="%" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={100} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                        formatter={(v: number) => [`${v.toFixed(1)}%`, 'Reply Rate']}
                      />
                      <Bar dataKey="replyRate" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Funnel */}
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Conversion Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <FunnelChart>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    />
                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                      <LabelList position="right" fill="#374151" fontSize={12} dataKey="name" />
                      <LabelList position="center" fill="#ffffff" fontSize={14} fontWeight="bold" dataKey="value" />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="py-20 text-center text-sm text-gray-400">Failed to load analytics.</div>
      )}
    </div>
  );
}
export default AnalyticsClient;

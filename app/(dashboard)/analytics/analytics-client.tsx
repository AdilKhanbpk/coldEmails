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

const tooltipStyle = {
  borderRadius: '12px',
  border: '1px solid #e7e5e4',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(28,25,23,0.06)',
};

const axisTick = { fontSize: 11, fill: '#a8a29e' };

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
    { label: 'Emails sent', value: data?.metrics.totalSent ?? 0, icon: Mail },
    { label: 'Open rate', value: `${data?.metrics.openRate ?? 0}%`, icon: Eye },
    { label: 'Click rate', value: `${data?.metrics.clickRate ?? 0}%`, icon: MousePointerClick },
    { label: 'Reply rate', value: `${data?.metrics.replyRate ?? 0}%`, icon: Reply },
    { label: 'Meetings booked', value: data?.metrics.totalMeetings ?? 0, icon: Calendar },
    { label: 'Bounce rate', value: `${data?.metrics.bounceRate ?? 0}%`, icon: TrendingUp },
  ];

  const funnelData = data
    ? [
      { name: 'Sent', value: data.funnel.sent, fill: '#C1613F' },
      { name: 'Opened', value: data.funnel.opened, fill: '#D3835F' },
      { name: 'Replied', value: data.funnel.replied, fill: '#E4AB8C' },
      { name: 'Meeting', value: data.funnel.meetingBooked, fill: '#F3E7DE' },
    ]
    : [];

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">

        {/* Header */}
        <div className="mb-8 border-b border-stone-200 pb-6 sm:mb-10">
          <h1 className="font-serif text-[28px] font-medium tracking-tight text-stone-900 sm:text-3xl">
            Analytics
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Track your outreach performance and engagement metrics.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-stone-400">
            <Filter className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="text-sm">Filters</span>
          </div>
          <Select value={dateRange} onValueChange={(value) => setDateRange(value as '7d' | '30d' | '90d')}>
            <SelectTrigger className="w-[140px] rounded-full border-stone-200 bg-white text-stone-700">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outreachTypeId} onValueChange={setOutreachTypeId}>
            <SelectTrigger className="w-[200px] rounded-full border-stone-200 bg-white text-stone-700">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outreach Types</SelectItem>
              {(outreachTypes || []).map((ot: OutreachType) => (
                <SelectItem key={ot.id} value={ot.id}>{ot.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAnalytics}
            disabled={loading}
            className="rounded-full border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
          </div>
        ) : data ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
              {metricCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className="rounded-2xl border-stone-200 bg-white shadow-none transition-colors hover:border-stone-300">
                    <CardContent className="p-4">
                      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#F3E7DE]">
                        <Icon className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
                      </div>
                      <p className="text-xs text-stone-500">{card.label}</p>
                      <p className="mt-1 text-xl font-semibold tracking-tight text-stone-900">{card.value}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Sends Over Time */}
            <Card className="rounded-2xl border-stone-200 bg-white shadow-none">
              <CardHeader>
                <CardTitle className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                  Sends, opens &amp; replies over time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.sendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1efea" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(new Date(d), 'MMM d')}
                      tick={axisTick}
                    />
                    <YAxis tick={axisTick} />
                    <Tooltip
                      labelFormatter={(d) => format(new Date(d), 'MMM d, yyyy')}
                      contentStyle={tooltipStyle}
                    />
                    <Line type="monotone" dataKey="sends" stroke="#C1613F" strokeWidth={2} dot={false} name="Sends" />
                    <Line type="monotone" dataKey="opens" stroke="#D3835F" strokeWidth={2} dot={false} name="Opens" />
                    <Line type="monotone" dataKey="replies" stroke="#7C4A32" strokeWidth={2} dot={false} name="Replies" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
              {/* Reply Rate by Outreach Type */}
              <Card className="rounded-2xl border-stone-200 bg-white shadow-none">
                <CardHeader>
                  <CardTitle className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                    Reply rate by outreach type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.replyByType.length === 0 ? (
                    <p className="py-8 text-center text-sm text-stone-400">No outreach types yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={data.replyByType} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1efea" />
                        <XAxis type="number" tick={axisTick} unit="%" />
                        <YAxis type="category" dataKey="name" tick={axisTick} width={100} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v: number) => [`${v.toFixed(1)}%`, 'Reply Rate']}
                        />
                        <Bar dataKey="replyRate" fill="#C1613F" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Funnel */}
              <Card className="rounded-2xl border-stone-200 bg-white shadow-none">
                <CardHeader>
                  <CardTitle className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                    Conversion funnel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <FunnelChart>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Funnel dataKey="value" data={funnelData} isAnimationActive>
                        <LabelList position="right" fill="#57534e" fontSize={12} dataKey="name" />
                        <LabelList position="center" fill="#ffffff" fontSize={14} fontWeight="bold" dataKey="value" />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-sm text-stone-400">Failed to load analytics.</div>
        )}
      </div>
    </div>
  );
}
export default AnalyticsClient;
import { useState } from 'react';
import { PatientList, Severity3DGraph } from '@/components/dashboard';
import type { PatientsResponse, RiskTier } from '@/types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

interface DashboardProps {
  data: PatientsResponse;
  onSelectPatient: (id: string) => void;
}

export function Dashboard({ data, onSelectPatient }: DashboardProps) {
  const [tierFilter, setTierFilter] = useState<RiskTier | 'all'>('all');

  const sortedPatients = [...data.patients]
    .sort((a, b) => b.current_risk_tier - a.current_risk_tier)
    .filter((p) => (tierFilter === 'all' ? true : p.current_risk_tier === tierFilter));

  const tierChartData = [
    { tier: 'Tier 3', count: data.summary.tier_3 },
    { tier: 'Tier 2', count: data.summary.tier_2 },
    { tier: 'Tier 1', count: data.summary.tier_1 },
    { tier: 'Tier 0', count: data.summary.tier_0 },
  ];

  const today = new Date();
  const monthName = today.toLocaleString('default', { month: 'long' });
  const year = today.getFullYear();
  const startOfMonth = new Date(year, today.getMonth(), 1);
  const startDay = startOfMonth.getDay(); // 0-6
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let currentDay = 1;

  for (let week = 0; week < 6; week++) {
    const row: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const cellIndex = week * 7 + d;
      if (cellIndex < startDay || currentDay > daysInMonth) {
        row.push(null);
      } else {
        row.push(currentDay++);
      }
    }
    weeks.push(row);
  }

  const todayDate = today.getDate();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Patient list — scrollable when long */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0 gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Patients in Need
              </h2>
              <span className="text-xs text-slate-500">
                Ordered by severity (Tier 3 → 0)
              </span>
            </div>
            <div className="flex gap-1">
              {(['all', 3, 2, 1, 0] as (RiskTier | 'all')[]).map((tier) => {
                const label =
                  tier === 'all'
                    ? 'All'
                    : `Tier ${tier}`;
                const isActive = tierFilter === tier;
                const count =
                  tier === 'all'
                    ? data.summary.total
                    : tier === 3
                    ? data.summary.tier_3
                    : tier === 2
                    ? data.summary.tier_2
                    : tier === 1
                    ? data.summary.tier_1
                    : data.summary.tier_0;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setTierFilter(tier)}
                    className={`px-2.5 py-1 rounded-full text-[0.7rem] border transition ${
                      isActive
                        ? 'bg-pregnancy text-white border-pregnancy'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label} <span className="ml-1 text-[0.65rem] opacity-80">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="overflow-y-auto max-h-[70vh] pr-1 -mr-1">
            <PatientList patients={sortedPatients} onSelect={onSelectPatient} />
          </div>
        </div>

        {/* Right: Calendar + 3D-style graph */}
        <div className="space-y-4">
          {/* Calendar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Calendar
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {monthName} {year}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[0.65rem] text-slate-500 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-xs">
              {weeks.map((week, wi) =>
                week.map((day, di) => {
                  const key = `${wi}-${di}`;
                  if (!day) {
                    return <div key={key} className="h-7" />;
                  }
                  const isToday = day === todayDate;
                  return (
                    <div
                      key={key}
                      className={`h-7 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-pregnancy text-white text-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {day}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          {/* Graph */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm graph-3d-shell">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Current Load
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  Patients by severity
                </div>
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="tier"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      boxShadow:
                        '0 18px 45px rgba(15,23,42,0.18)',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[10, 10, 2, 2]}
                    fill="url(#tierGradient)"
                  />
                  <defs>
                    <linearGradient id="tierGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#fecaca" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width 3D severity graph */}
      <Severity3DGraph patients={data.patients} onSelectPatient={onSelectPatient} />
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { PatientList, RiskRouteMap } from '@/components/dashboard';
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

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const start = new Date(year, month, 1);
  const startDay = start.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
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
  return weeks;
}

function dateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 19; h++) {
  for (const m of ['00', '30']) {
    if (h === 19 && m === '30') break;
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

interface Appointment {
  id?: string; // present for new appointments; used for stable list keys
  patientId: string;
  patientName: string;
  time: string;
  timeEnd: string;
}

export function Dashboard({ data, onSelectPatient }: DashboardProps) {
  const [tierFilter, setTierFilter] = useState<RiskTier | 'all'>('all');
  const [calendarPopupOpen, setCalendarPopupOpen] = useState(false);
  const [appointments, setAppointments] = useState<Record<string, Appointment[]>>({});
  const [popupView, setPopupView] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [schedulePopupDate, setSchedulePopupDate] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{ patientId: string; time: string; timeEnd: string }>({
    patientId: '',
    time: '',
    timeEnd: '',
  });

  const patientsByTier = useMemo(() => {
    const byTier: Record<RiskTier, typeof data.patients> = { 3: [], 2: [], 1: [], 0: [] };
    for (const p of data.patients) {
      byTier[p.current_risk_tier].push(p);
    }
    (['3', '2', '1', '0'] as const).forEach((t) => {
      const tier = Number(t) as RiskTier;
      byTier[tier].sort((a, b) => a.name.localeCompare(b.name));
    });
    return byTier;
  }, [data.patients]);

  const TIER_LABELS: Record<RiskTier, string> = { 0: 'Normal', 1: 'Watch', 2: 'Concern', 3: 'Emergency' };

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
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const monthName = today.toLocaleString('default', { month: 'long' });
  const year = currentYear;
  const weeks = useMemo(
    () => buildCalendarWeeks(currentYear, currentMonth),
    [currentYear, currentMonth],
  );
  const todayDate = today.getDate();

  const popupWeeks = useMemo(
    () => buildCalendarWeeks(popupView.year, popupView.month),
    [popupView.year, popupView.month],
  );
  const popupMonthName = new Date(popupView.year, popupView.month, 1).toLocaleString('default', { month: 'long' });

  const endTimeOptions = useMemo(() => {
    if (!addForm.time) return TIME_SLOTS;
    return TIME_SLOTS.filter((t) => t > addForm.time);
  }, [addForm.time]);

  const handleAddAppointment = () => {
    if (!selectedDate || !addForm.patientId || !addForm.time || !addForm.timeEnd) return;
    if (addForm.timeEnd <= addForm.time) return;
    const patient = data.patients.find((p) => p.id === addForm.patientId);
    if (!patient) return;
    const existing = appointments[selectedDate] ?? [];
    const overlaps = existing.some(
      (a) => addForm.time < a.timeEnd && addForm.timeEnd > a.time,
    );
    if (overlaps) return;
    setAppointments((prev) => ({
      ...prev,
      [selectedDate]: [
        ...existing,
        {
          id: crypto.randomUUID(),
          patientId: patient.id,
          patientName: patient.name,
          time: addForm.time,
          timeEnd: addForm.timeEnd,
        },
      ].sort((a, b) => a.time.localeCompare(b.time)),
    }));
    setAddForm({ patientId: '', time: '', timeEnd: '' });
  };

  const getAppointmentKey = (a: Appointment) => a.id ?? `${a.patientId}-${a.time}-${a.timeEnd}`;
  const handleRemoveAppointment = (date: string, idOrKey: string) => {
    setAppointments((prev) => {
      const list = prev[date] ?? [];
      const next = list.filter((a) => getAppointmentKey(a) !== idOrKey);
      if (next.length === 0) {
        const { [date]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [date]: next };
    });
  };

  const formatTimeDisplay = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const formatTimeRange = (start: string, end: string) =>
    `${formatTimeDisplay(start)} – ${formatTimeDisplay(end)}`;

  useEffect(() => {
    if (!calendarPopupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarPopupOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [calendarPopupOpen]);

  // When calendar popup opens, select today by default
  const prevPopupOpen = useRef(false);
  useEffect(() => {
    if (calendarPopupOpen && !prevPopupOpen.current) {
      const t = new Date();
      setSelectedDate(dateKey(t.getFullYear(), t.getMonth(), t.getDate()));
    }
    prevPopupOpen.current = calendarPopupOpen;
  }, [calendarPopupOpen]);

  // Prevent body scroll when any popup is open
  const popupOpen = calendarPopupOpen || schedulePopupDate !== null;
  useEffect(() => {
    if (popupOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [popupOpen]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Patient list — scrollable when long */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0 gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
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
                <div className="text-base font-bold text-slate-900">
                  {monthName} {year}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalendarPopupOpen(true)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                title="Open calendar"
                aria-label="Open calendar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
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
                  const dk = dateKey(currentYear, currentMonth, day);
                  const hasAppointments = (appointments[dk]?.length ?? 0) > 0;
                  return (
                    <div
                      key={key}
                      className={`h-7 flex flex-col items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-pregnancy text-white text-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{day}</span>
                      {hasAppointments && (
                        <span className={`w-1 h-1 rounded-full mt-0.5 ${isToday ? 'bg-white' : 'bg-pregnancy'}`} aria-hidden />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          {/* Calendar popup */}
          {calendarPopupOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
              onClick={() => setCalendarPopupOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Calendar"
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-[56rem] h-[32rem] overflow-hidden flex flex-col shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-slate-50/50">
                  <h3 className="text-lg font-bold text-slate-900">Calendar</h3>
                  <button
                    type="button"
                    onClick={() => setCalendarPopupOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Close (Esc)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-1 min-h-0">
                  {/* Left: calendar */}
                  <div className="flex flex-col min-w-0 flex-1 border-r border-slate-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          monthPickerOpen
                            ? setPopupView((v) => ({ ...v, year: v.year - 1 }))
                            : setPopupView((v) =>
                                v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 },
                              )
                        }
                        className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                      >
                        ← Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => (monthPickerOpen ? setMonthPickerOpen(false) : setMonthPickerOpen(true))}
                        className="text-base font-semibold text-slate-900 hover:bg-slate-100 hover:text-pregnancy px-3 py-1.5 rounded-lg transition"
                      >
                        {monthPickerOpen ? popupView.year : `${popupMonthName} ${popupView.year}`}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          monthPickerOpen
                            ? setPopupView((v) => ({ ...v, year: v.year + 1 }))
                            : setPopupView((v) =>
                                v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 },
                              )
                        }
                        className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                      >
                        Next →
                      </button>
                    </div>
                    <div className="p-4 flex-1 overflow-auto flex flex-col justify-center min-h-0">
                  {monthPickerOpen ? (
                    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                      {[
                        'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December',
                      ].map((name, monthIndex) => {
                        const isCurrent =
                          today.getFullYear() === popupView.year && today.getMonth() === monthIndex;
                        const isSelected = !monthPickerOpen ? false : popupView.month === monthIndex;
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setPopupView((v) => ({ ...v, month: monthIndex }));
                              setMonthPickerOpen(false);
                            }}
                            className={`py-2.5 px-3 rounded-lg text-sm font-medium transition ${
                              isCurrent
                                ? 'bg-pregnancy text-white'
                                : isSelected
                                  ? 'bg-pregnancy/15 text-pregnancy border border-pregnancy/40'
                                  : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="max-w-sm mx-auto w-full">
                      <div className="grid grid-cols-7 gap-1 text-[0.7rem] text-slate-500 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                          <div key={d} className="text-center font-medium">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-sm">
                    {popupWeeks.map((week, wi) =>
                      week.map((day, di) => {
                        const key = `${wi}-${di}`;
                        if (!day) {
                          return <div key={key} className="h-10" />;
                        }
                        const dk = dateKey(popupView.year, popupView.month, day);
                        const isSelected = selectedDate === dk;
                        const hasAppointments = (appointments[dk]?.length ?? 0) > 0;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedDate(dk)}
                            className={`h-10 flex flex-col items-center justify-center rounded-lg border transition ${
                              isSelected
                                ? 'border-pregnancy bg-pregnancy/10 ring-1 ring-pregnancy/30'
                                : 'border-transparent hover:bg-slate-100'
                            }`}
                          >
                            <span className={isSelected ? 'font-bold text-pregnancy' : 'text-slate-700'}>{day}</span>
                            {hasAppointments && (
                              <span className="w-1.5 h-1.5 rounded-full bg-pregnancy mt-0.5" />
                            )}
                          </button>
                        );
                      }),
                    )}
                  </div>
                    </div>
                  )}
                    </div>
                  </div>

                  {/* Right: appointments panel — single layout; form greyed when no date selected */}
                  <div className="w-80 shrink-0 self-stretch flex flex-col bg-slate-50 min-h-0 border-l border-slate-200">
                    <div className="p-4 flex flex-col flex-1 min-h-0 overflow-hidden flex-nowrap">
                      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                        <h4 className="text-sm font-semibold text-slate-800">
                          Appointments — {selectedDate ?? 'Select a date'}
                        </h4>
                        {selectedDate && (
                          <button
                            type="button"
                            onClick={() => setSchedulePopupDate(selectedDate)}
                            className="text-xs font-medium text-pregnancy hover:text-pregnancy-dark hover:underline"
                          >
                            View schedule
                          </button>
                        )}
                      </div>
                      {selectedDate && (
                        <p className="text-sm text-slate-500 mb-2 shrink-0">
                          {(appointments[selectedDate] ?? []).length} appointment{(appointments[selectedDate] ?? []).length !== 1 ? 's' : ''} · Open schedule to see names and times
                        </p>
                      )}
                      {!selectedDate && (
                        <p className="text-sm text-slate-500 mb-2 shrink-0">
                          Click a date on the calendar to view or add appointments
                        </p>
                      )}
                      <div
                        className={`rounded-xl border border-slate-200 bg-white p-4 space-y-4 shrink-0 transition ${
                          selectedDate ? '' : 'opacity-60 pointer-events-none'
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Add appointment
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label htmlFor="apt-patient" className="block text-xs font-medium text-slate-600 mb-1.5">
                              Patient
                            </label>
                            <select
                              id="apt-patient"
                              value={addForm.patientId}
                              onChange={(e) => setAddForm((f) => ({ ...f, patientId: e.target.value }))}
                              disabled={!selectedDate}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-pregnancy/30 focus:border-pregnancy disabled:bg-slate-100 disabled:text-slate-500"
                            >
                              <option value="">Select patient</option>
                              {([3, 2, 1, 0] as RiskTier[]).map((tier) => {
                                const list = patientsByTier[tier];
                                if (list.length === 0) return null;
                                return (
                                  <optgroup
                                    key={tier}
                                    label={`Tier ${tier} — ${TIER_LABELS[tier]}`}
                                  >
                                    {list.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                            </select>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label htmlFor="apt-time" className="block text-xs font-medium text-slate-600 mb-1.5">
                                Start time
                              </label>
                              <select
                                id="apt-time"
                                value={addForm.time}
                                onChange={(e) => {
                                  const time = e.target.value;
                                  setAddForm((f) => ({
                                    ...f,
                                    time,
                                    timeEnd: time && f.timeEnd && f.timeEnd <= time ? '' : f.timeEnd,
                                  }));
                                }}
                                disabled={!selectedDate}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-pregnancy/30 focus:border-pregnancy disabled:bg-slate-100 disabled:text-slate-500"
                              >
                                <option value="">Select start</option>
                                {TIME_SLOTS.map((t) => (
                                  <option key={t} value={t}>
                                    {formatTimeDisplay(t)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="apt-time-end" className="block text-xs font-medium text-slate-600 mb-1.5">
                                End time
                              </label>
                              <select
                                id="apt-time-end"
                                value={addForm.timeEnd}
                                onChange={(e) => setAddForm((f) => ({ ...f, timeEnd: e.target.value }))}
                                disabled={!addForm.time || !selectedDate}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-pregnancy/30 focus:border-pregnancy disabled:bg-slate-100 disabled:text-slate-500"
                              >
                                <option value="">Select end</option>
                                {endTimeOptions.map((t) => (
                                  <option key={t} value={t}>
                                    {formatTimeDisplay(t)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddAppointment}
                          disabled={!selectedDate || !addForm.patientId || !addForm.time || !addForm.timeEnd || addForm.timeEnd <= addForm.time}
                          className="w-full px-4 py-2.5 rounded-lg bg-pregnancy text-white text-sm font-semibold hover:bg-pregnancy-dark disabled:opacity-50 disabled:pointer-events-none transition"
                        >
                          Add appointment
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Schedule popup — day timeline with colored appointment blocks */}
          {schedulePopupDate && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
              onClick={() => setSchedulePopupDate(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Schedule"
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
                  <h3 className="text-lg font-bold text-slate-900">Schedule — {schedulePopupDate}</h3>
                  <button
                    type="button"
                    onClick={() => setSchedulePopupDate(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 overflow-y-auto">
                  {((appointments[schedulePopupDate] ?? []).length === 0) ? (
                    <p className="text-sm text-slate-500 text-center py-6">No appointments this day.</p>
                  ) : (
                    <div className="relative">
                      {/* Time labels: 7:00–19:00 — same height as timeline */}
                      <div className="flex gap-3 h-[432px]">
                        <div className="w-14 shrink-0 flex flex-col text-[0.65rem] text-slate-500 tabular-nums">
                          {Array.from({ length: 13 }, (_, i) => 7 + i).map((h) => (
                            <div key={h} className="flex-1 flex items-start pt-0.5">
                              {h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`}
                            </div>
                          ))}
                        </div>
                        {/* Timeline track */}
                        <div className="flex-1 relative h-full rounded-lg border border-slate-200 bg-slate-50/50">
                          {(appointments[schedulePopupDate] ?? [])
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((apt, idx) => {
                              const [sh, sm] = apt.time.split(':').map(Number);
                              const [eh, em] = apt.timeEnd.split(':').map(Number);
                              const startMin = (sh - 7) * 60 + sm;
                              const endMin = (eh - 7) * 60 + em;
                              const totalMin = 12 * 60;
                              const topPct = (startMin / totalMin) * 100;
                              const heightPct = ((endMin - startMin) / totalMin) * 100;
                              const colors = [
                                'bg-pregnancy text-white',
                                'bg-blue-500 text-white',
                                'bg-emerald-600 text-white',
                                'bg-amber-500 text-white',
                                'bg-violet-500 text-white',
                              ];
                              const color = colors[idx % colors.length];
                              return (
                                <div
                                  key={getAppointmentKey(apt)}
                                  className={`absolute left-1 right-1 rounded-md px-2 py-1.5 shadow-sm flex items-center justify-between gap-2 min-h-[28px] ${color}`}
                                  style={{
                                    top: `${topPct}%`,
                                    height: `${Math.max(heightPct, 4)}%`,
                                  }}
                                >
                                  <div className="min-w-0 flex flex-col justify-center">
                                    <span className="text-xs font-semibold truncate">{apt.patientName}</span>
                                    <span className="text-[0.65rem] opacity-90 tabular-nums">
                                      {formatTimeDisplay(apt.time)} – {formatTimeDisplay(apt.timeEnd)}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAppointment(schedulePopupDate, getAppointmentKey(apt))}
                                    className="shrink-0 p-1 rounded opacity-80 hover:opacity-100"
                                    aria-label="Remove appointment"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current Load — 2D bar chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Current Load
                </div>
                <div className="text-base font-bold text-slate-900">
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
                      color: '#000',
                      boxShadow: '0 18px 45px rgba(15,23,42,0.18)',
                    }}
                    itemStyle={{ color: '#000' }}
                    labelStyle={{ color: '#000' }}
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

      {/* Full-width route map */}
      <RiskRouteMap patients={data.patients} onSelectPatient={onSelectPatient} />
    </div>
  );
}

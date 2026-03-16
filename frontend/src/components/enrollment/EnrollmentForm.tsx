import { useState } from 'react';
import { patientsApi } from '@/api/patients';
import type { FamilyHistory, FamilyHistoryAnswer, PatientEnrollRequest } from '@/types';

interface EnrollmentFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const FAMILY_HISTORY_QUESTIONS: { key: keyof Omit<FamilyHistory, 'notes'>; label: string }[] = [
  {
    key: 'preeclampsia_eclampsia',
    label: "Mother or sister ever had preeclampsia or eclampsia?",
  },
  {
    key: 'hypertension',
    label: "Mother or father diagnosed with chronic hypertension?",
  },
  {
    key: 'diabetes_t2',
    label: "Mother or father diagnosed with type 2 diabetes?",
  },
  {
    key: 'gestational_diabetes',
    label: "Mother or sister had gestational diabetes?",
  },
  {
    key: 'clotting_disorders',
    label: 'Family history of blood clotting disorders (thrombophilia, DVT)?',
  },
  {
    key: 'autoimmune',
    label: 'Family history of autoimmune conditions (lupus, thyroid disease)?',
  },
  {
    key: 'preterm_or_miscarriage',
    label: "Mother or sister had preterm birth or recurrent miscarriage?",
  },
  {
    key: 'sickle_cell_thalassemia',
    label: 'Family history of sickle cell disease or thalassemia?',
  },
];

const PERSONAL_RISK_FACTORS = [
  { key: 'primigravida', label: 'First pregnancy', sub: 'Primigravida' },
  { key: 'prior_preeclampsia', label: 'Prior preeclampsia', sub: 'Personal history' },
  { key: 'chronic_hypertension', label: 'Chronic hypertension', sub: 'Pre-existing' },
  { key: 'multiple_gestation', label: 'Multiple gestation', sub: 'Twins / triplets' },
  { key: 'prior_pph', label: 'Prior postpartum hemorrhage', sub: 'Personal history' },
] as const;

function SectionBadge({ number }: { number: number }) {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#B85050] text-white text-xs font-bold flex items-center justify-center shadow-sm">
      {number}
    </div>
  );
}

function SectionCard({ number, title, subtitle, children }: {
  number: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/60">
        <SectionBadge number={number} />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-[#B85050] ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#B85050]/30 focus:border-[#B85050]/60 transition bg-white';

function ToggleGroup({
  value,
  onChange,
}: {
  value: FamilyHistoryAnswer | undefined;
  onChange: (v: FamilyHistoryAnswer) => void;
}) {
  const options: { val: FamilyHistoryAnswer; label: string; activeClass: string }[] = [
    { val: 'yes', label: 'Yes', activeClass: 'bg-red-50 text-red-700 border-red-300 font-semibold' },
    { val: 'no', label: 'No', activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold' },
    { val: 'unknown', label: 'Unknown', activeClass: 'bg-slate-100 text-slate-600 border-slate-300 font-semibold' },
  ];
  return (
    <div className="flex gap-1.5">
      {options.map(({ val, label, activeClass }) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`px-3 py-1 text-xs rounded-lg border transition-all ${
            value === val
              ? activeClass
              : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function EnrollmentForm({ onSuccess, onCancel }: EnrollmentFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gestationalWeeks, setGestationalWeeks] = useState('');
  const [status, setStatus] = useState<'pregnant' | 'postpartum'>('pregnant');
  const [estimatedDueDate, setEstimatedDueDate] = useState('');

  const [riskFlags, setRiskFlags] = useState({
    primigravida: false,
    prior_preeclampsia: false,
    chronic_hypertension: false,
    multiple_gestation: false,
    prior_pph: false,
  });

  const [familyHistory, setFamilyHistory] = useState<FamilyHistory>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<string | null>(null);

  const setFhField = (key: keyof Omit<FamilyHistory, 'notes'>, value: FamilyHistoryAnswer) => {
    setFamilyHistory((prev: FamilyHistory) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Patient name is required.');
    if (!phone.trim()) return setError('Phone number is required.');
    if (!gestationalWeeks || isNaN(Number(gestationalWeeks)) || Number(gestationalWeeks) < 1)
      return setError('Gestational age is required.');

    const hasFhAnswers = Object.entries(familyHistory).some(([k, v]) => k !== 'notes' && v !== undefined);
    const payload: PatientEnrollRequest = {
      name: name.trim(),
      phone_number: phone.trim(),
      gestational_age_at_enrollment: Math.round(Number(gestationalWeeks) * 7),
      status,
      address: address.trim() || null,
      estimated_due_date: estimatedDueDate || null,
      risk_factors: {
        ...riskFlags,
        ...(hasFhAnswers || familyHistory.notes ? { family_history: familyHistory } : {}),
      },
    };

    setSubmitting(true);
    try {
      const result = await patientsApi.enroll(payload);
      setEnrolled(result.patient.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Enrollment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (enrolled) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-1">{enrolled} enrolled</h2>
          <p className="text-sm text-slate-500 mb-8">Welcome SMS sent. First check-in has been scheduled.</p>
          <button
            onClick={onSuccess}
            className="px-8 py-2.5 rounded-xl bg-[#B85050] text-white text-sm font-medium hover:bg-[#9A4040] transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const fhAnsweredCount = Object.entries(familyHistory).filter(([k, v]) => k !== 'notes' && v !== undefined).length;

  return (
    <div className="max-w-2xl mx-auto pb-12">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Enroll New Patient</h2>
          <p className="text-xs text-slate-400 mt-0.5">Complete all required fields to register a patient</p>
        </div>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition px-3 py-1.5 rounded-lg hover:bg-slate-100"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Section 1 — Patient Details */}
        <SectionCard number={1} title="Patient Details" subtitle="Basic identification and contact information">
          <div className="space-y-4">
            <Field label="Full Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amina Hassan"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Phone Number" required hint="Include country code (e.g. +1 647...)">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 647 555 0100"
                  className={inputClass}
                />
              </Field>
              <Field label="Address / Community">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Village or community (optional)"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* Section 2 — Pregnancy Information */}
        <SectionCard number={2} title="Pregnancy Information" subtitle="Current clinical status">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Gestational Age" required hint="In weeks">
              <input
                type="number"
                min={1}
                max={42}
                value={gestationalWeeks}
                onChange={(e) => setGestationalWeeks(e.target.value)}
                placeholder="e.g. 28"
                className={inputClass}
              />
            </Field>

            <Field label="Status" required>
              <div className="flex gap-2 mt-0.5">
                {(['pregnant', 'postpartum'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`flex-1 py-2.5 text-xs font-medium rounded-xl border transition-all capitalize ${
                      status === s
                        ? 'bg-[#B85050] text-white border-[#B85050] shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-[#B85050]/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Estimated Due Date">
              <input
                type="date"
                value={estimatedDueDate}
                onChange={(e) => setEstimatedDueDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Section 3 — Personal Risk Factors */}
        <SectionCard number={3} title="Personal Risk Factors" subtitle="Select all that apply">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PERSONAL_RISK_FACTORS.map(({ key, label, sub }) => (
              <label
                key={key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  riskFlags[key]
                    ? 'bg-rose-50 border-[#B85050]/40 text-slate-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={riskFlags[key]}
                  onChange={(e) => setRiskFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
                  className="hidden"
                />
                <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                  riskFlags[key] ? 'bg-[#B85050] border-[#B85050]' : 'border-slate-300'
                }`}>
                  {riskFlags[key] && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
                </div>
              </label>
            ))}
          </div>
        </SectionCard>

        {/* Section 4 — Family History */}
        <SectionCard
          number={4}
          title="Family History"
          subtitle={
            fhAnsweredCount > 0
              ? `${fhAnsweredCount} of ${FAMILY_HISTORY_QUESTIONS.length} answered`
              : 'All optional — select Unknown if information unavailable'
          }
        >
          <div className="space-y-1">
            {FAMILY_HISTORY_QUESTIONS.map(({ key, label }, i) => (
              <div
                key={String(key)}
                className={`flex items-center justify-between gap-4 py-3 ${
                  i < FAMILY_HISTORY_QUESTIONS.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <p className="text-sm text-slate-700 leading-snug flex-1">{label}</p>
                <div className="flex-shrink-0">
                  <ToggleGroup value={familyHistory[key]} onChange={(v) => setFhField(key, v)} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <Field label="Additional Notes">
              <textarea
                value={familyHistory.notes ?? ''}
                onChange={(e) => setFamilyHistory((prev: FamilyHistory) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Any other relevant family medical history..."
                className={`${inputClass} resize-none`}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-8 py-2.5 rounded-xl bg-[#B85050] text-white text-sm font-medium hover:bg-[#9A4040] disabled:opacity-50 transition shadow-sm"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Enrolling...
              </span>
            ) : (
              'Enroll Patient'
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
          >
            Cancel
          </button>
        </div>

      </form>
    </div>
  );
}

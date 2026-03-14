import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface ChartPoint {
  name: string;
  wellbeing: number;
  headache: number;
}

interface SymptomChartProps {
  chartData: ChartPoint[];
}

export function SymptomChart({ chartData }: SymptomChartProps) {
  if (chartData.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h3 className="font-semibold text-base text-slate-900 mb-4">Symptom timeline</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" stroke="#64748b" fontSize={12} tick={{ fill: '#475569' }} />
          <YAxis domain={[0, 3]} stroke="#64748b" fontSize={12} tick={{ fill: '#475569' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            labelStyle={{ color: '#0f172a' }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="wellbeing"
            stroke="#B85050"
            strokeWidth={2}
            name="Wellbeing"
          />
          <Line
            type="monotone"
            dataKey="headache"
            stroke="#DC2626"
            strokeWidth={2}
            name="Headache"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

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
    <div className="bg-slate-800 rounded-xl p-4 mb-4">
      <h3 className="font-bold text-lg mb-3 text-slate-100">Symptom Timeline</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
          <YAxis domain={[0, 3]} stroke="#94A3B8" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1E293B',
              border: 'none',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F1F5F9' }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="wellbeing"
            stroke="#3B82F6"
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

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, Anomaly, ChaosScenario } from '../api';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

export default function AnomalyCenter() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      api.getAnomalies().then(setAnomalies).catch(e => setError(e.message));
    };
    load();
    api.getChaosScenarios().then(setScenarios).catch(() => {});
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleTrigger = async (scenario: string) => {
    try {
      setTriggerStatus(`Triggering: ${scenario}...`);
      await api.triggerChaos(scenario, ['CH-00F-001', 'PP-01F-001']);
      setTriggerStatus(`Triggered: ${scenario}`);
      setTimeout(() => setTriggerStatus(null), 3000);
    } catch {
      setTriggerStatus('Failed to trigger');
    }
  };

  // Aggregate by type for chart
  const typeCounts = anomalies.reduce((acc, a) => {
    acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const chartData = Object.entries(typeCounts).map(([type, count]) => ({ type, count }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Anomaly & Alert Center</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Anomaly Trend */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Anomalies by Type</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="type" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569' }} />
              <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chaos Control Panel */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Fault Injection Control</h3>
          {triggerStatus && (
            <div className="bg-amber-900/50 text-amber-200 rounded px-3 py-2 mb-3 text-sm">
              {triggerStatus}
            </div>
          )}
          <div className="space-y-2">
            {scenarios.map(s => (
              <div key={s.name} className="flex items-center justify-between bg-slate-700 rounded p-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.description}</div>
                </div>
                <button
                  onClick={() => handleTrigger(s.name)}
                  className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
                >
                  Trigger
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alert Stream */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Recent Alerts</h3>
        <div className="space-y-2 max-h-96 overflow-auto">
          {anomalies.length === 0 ? (
            <div className="text-slate-400 text-center py-8">No anomalies detected</div>
          ) : anomalies.map(a => (
            <div key={a.id} className="flex items-start gap-3 bg-slate-700 rounded p-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_COLORS[a.severity] || 'bg-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{a.device_id}</span>
                  <span className="text-xs text-slate-400 capitalize">{a.anomaly_type}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    a.severity === 'critical' ? 'bg-red-900 text-red-200'
                    : a.severity === 'warning' ? 'bg-amber-900 text-amber-200'
                    : 'bg-blue-900 text-blue-200'
                  }`}>{a.severity}</span>
                </div>
                <div className="text-sm text-slate-300 truncate">{a.message}</div>
                <div className="text-xs text-slate-500">{new Date(a.detected_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, Anomaly, ChaosScenario, connectWebSocket } from '../api';

const SEVERITY_COLORS: Record<string, { dot: string; badge: string }> = {
  critical: { dot: 'bg-red-500', badge: 'bg-red-900 text-red-200' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-900 text-amber-200' },
  info: { dot: 'bg-blue-500', badge: 'bg-blue-900 text-blue-200' },
};

const STATE_BADGE: Record<string, string> = {
  pending: 'bg-yellow-800 text-yellow-200',
  firing: 'bg-red-800 text-red-200',
  resolved: 'bg-green-800 text-green-200',
};

export default function AnomalyCenter() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>('firing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      api.getAnomalies().then(setAnomalies).catch(e => setError(e.message));
    };
    load();
    api.getChaosScenarios().then(setScenarios).catch(() => {});
    const timer = setInterval(load, 30000);
    const socket = connectWebSocket((message) => {
      if (message.channel !== 'anomalies' || !message.data || typeof message.data !== 'object') {
        return;
      }

      const data = message.data as Partial<Anomaly>;
      if (!data.device_id || !data.anomaly_type || !data.detected_at) {
        return;
      }

      setAnomalies((current) => {
        const next = [{
          id: data.id ?? Date.now(),
          fingerprint: data.fingerprint ?? '',
          device_id: data.device_id,
          anomaly_type: data.anomaly_type,
          severity: data.severity ?? 'warning',
          state: data.state ?? 'firing',
          message: data.message ?? '',
          detected_at: data.detected_at,
          fired_at: data.fired_at,
          resolved_at: data.resolved_at,
          occurrence_count: data.occurrence_count ?? 1,
        } as Anomaly, ...current];
        return next.slice(0, 200);
      });
    });

    socket.subscribe('anomalies');

    return () => {
      clearInterval(timer);
      socket.unsubscribe('anomalies');
      socket.close();
    };
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

  const filtered = useMemo(() => {
    if (stateFilter === 'all') return anomalies;
    return anomalies.filter(a => a.state === stateFilter);
  }, [anomalies, stateFilter]);

  const chartData = useMemo(() => {
    const typeCounts = filtered.reduce((acc, a) => {
      acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(typeCounts).map(([type, count]) => ({ type, count }));
  }, [filtered]);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, firing: 0, resolved: 0 };
    for (const a of anomalies) counts[a.state] = (counts[a.state] ?? 0) + 1;
    return counts;
  }, [anomalies]);

  if (error) return <div className="text-red-400 p-4">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Anomaly & Alert Center</h2>

      {/* State summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['pending', 'firing', 'resolved'] as const).map(state => (
          <button key={state} onClick={() => setStateFilter(state)}
            className={`bg-slate-800 rounded-lg p-4 border text-left transition-colors ${
              stateFilter === state ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
            }`}>
            <div className="text-xs text-slate-400 uppercase">{state}</div>
            <div className={`text-2xl font-bold ${
              state === 'firing' ? 'text-red-400' : state === 'pending' ? 'text-amber-400' : 'text-green-400'
            }`}>{stateCounts[state] ?? 0}</div>
          </button>
        ))}
      </div>

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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Alerts</h3>
          <div className="flex gap-2">
            {['all', 'pending', 'firing', 'resolved'].map(s => (
              <button key={s} onClick={() => setStateFilter(s)}
                className={`px-3 py-1 rounded text-sm capitalize ${
                  stateFilter === s ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-auto">
          {filtered.length === 0 ? (
            <div className="text-slate-400 text-center py-8">No anomalies detected</div>
          ) : filtered.map(a => (
            <div key={`${a.id}-${a.fingerprint}`} className="flex items-start gap-3 bg-slate-700 rounded p-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_COLORS[a.severity]?.dot || 'bg-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{a.device_id}</span>
                  <span className="text-xs text-slate-400 capitalize">{a.anomaly_type}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    SEVERITY_COLORS[a.severity]?.badge || 'bg-gray-900 text-gray-200'
                  }`}>{a.severity}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    STATE_BADGE[a.state] || 'bg-gray-900 text-gray-200'
                  }`}>{a.state}</span>
                  {a.occurrence_count > 1 && (
                    <span className="text-xs text-slate-500">x{a.occurrence_count}</span>
                  )}
                </div>
                <div className="text-sm text-slate-300 truncate">{a.message}</div>
                <div className="text-xs text-slate-500">
                  {new Date(a.detected_at).toLocaleString()}
                  {a.resolved_at && <span className="ml-2 text-green-500">Resolved: {new Date(a.resolved_at).toLocaleString()}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

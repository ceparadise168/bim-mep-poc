import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api, DeviceDetail as DeviceDetailType, Signal, Maintenance, connectWebSocket } from '../api';
import { formatDeviceType } from '../utils';

const METRIC_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#ec4899'];

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const [device, setDevice] = useState<DeviceDetailType | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [timeRange, setTimeRange] = useState('1h');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getDevice(id).then(setDevice).catch(e => setError(e.message));
    api.getDeviceMaintenance(id).then(setMaintenance).catch(() => {});

    const load = () => {
      const now = new Date();
      const from = new Date(now.getTime() - (timeRange === '1h' ? 3600000 : timeRange === '24h' ? 86400000 : 604800000));
      api.getDeviceSignals(id, {
        from: from.toISOString(),
        interval: timeRange === '7d' ? '1h' : timeRange === '24h' ? '1m' : 'raw',
      }).then(setSignals).catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    const socket = connectWebSocket((message) => {
      if (message.channel !== `signals:${id}` || !message.data || typeof message.data !== 'object') {
        return;
      }

      const data = message.data as {
        timestamp?: number;
        payload?: Record<string, number | string | boolean>;
      };

      if (!data.payload || typeof data.timestamp !== 'number') {
        return;
      }

      const liveSignals = Object.entries(data.payload)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([metricName, value]) => ({
          time: new Date(data.timestamp!).toISOString(),
          metric_name: metricName,
          value,
        }));

      if (liveSignals.length > 0) {
        setSignals((current) => [...current, ...liveSignals].slice(-300));
      }
    });

    socket.subscribe(`signals:${id}`);

    return () => {
      clearInterval(timer);
      socket.unsubscribe(`signals:${id}`);
      socket.close();
    };
  }, [id, timeRange]);

  const { metricNames, chartData } = useMemo(() => {
    const names = [...new Set(signals.map(s => s.metric_name))];
    const timeMap = new Map<string, Record<string, number>>();
    for (const s of signals) {
      const t = s.time;
      if (!timeMap.has(t)) timeMap.set(t, {});
      timeMap.get(t)![s.metric_name] = s.value;
    }
    const data = Array.from(timeMap.entries())
      .map(([time, metrics]) => ({ time, ...metrics }))
      .sort((a, b) => a.time.localeCompare(b.time));
    return { metricNames: names, chartData: data };
  }, [signals]);

  if (error) return <div className="text-red-400 p-4">Error: {error}</div>;
  if (!device) return <div className="text-slate-400 p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-cyan-400 hover:text-cyan-300">&larr; Back</Link>
        <h2 className="text-2xl font-bold">{device.device_id}</h2>
        <span className="bg-slate-700 text-slate-300 rounded px-2 py-0.5 text-sm capitalize">
          {formatDeviceType(device.device_type)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-3">Latest Readings</h3>
          <div className="grid grid-cols-2 gap-3">
            {device.latestSignals?.map(s => (
              <div key={s.metric_name} className="bg-slate-700 rounded p-3">
                <div className="text-xs text-slate-400 capitalize">{s.metric_name.replace(/([A-Z])/g, ' $1')}</div>
                <div className="text-xl font-bold text-cyan-300">{typeof s.value === 'number' ? s.value.toFixed(1) : s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-3">Device Information</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-400">Vendor</dt><dd>{device.vendor_name}</dd>
            <dt className="text-slate-400">Model</dt><dd>{device.vendor_model}</dd>
            <dt className="text-slate-400">Protocol</dt><dd>{device.vendor_protocol}</dd>
            <dt className="text-slate-400">Firmware</dt><dd>{device.firmware_version}</dd>
            <dt className="text-slate-400">Floor</dt><dd>{device.floor}F</dd>
            <dt className="text-slate-400">Zone</dt><dd>{device.zone}</dd>
            {device.geometry && (
              <>
                <dt className="text-slate-400">Position</dt>
                <dd>({device.geometry.position.x}, {device.geometry.position.y}, {device.geometry.position.z})</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Signal History</h3>
          <div className="flex gap-2">
            {['1h', '24h', '7d'].map(r => (
              <button key={r} onClick={() => setTimeRange(r)}
                className={`px-3 py-1 rounded text-sm ${
                  timeRange === r ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => new Date(v).toLocaleTimeString()} />
            <YAxis tick={{ fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569' }} />
            <Legend />
            {metricNames.map((name, i) => (
              <Line key={name} type="monotone" dataKey={name} stroke={METRIC_COLORS[i % METRIC_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {maintenance.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-3">Maintenance History</h3>
          <div className="space-y-2">
            {maintenance.map(m => (
              <div key={m.id} className="flex gap-4 text-sm border-l-2 border-cyan-500 pl-3 py-1">
                <span className="text-slate-400 whitespace-nowrap">{new Date(m.performed_at).toLocaleDateString()}</span>
                <span className="capitalize text-amber-300">{m.log_type}</span>
                <span>{m.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

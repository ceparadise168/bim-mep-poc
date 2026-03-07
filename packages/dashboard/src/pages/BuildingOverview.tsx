import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, BuildingDashboard, connectWebSocket } from '../api';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6b7280'];
const STATUS_LABELS = ['Normal', 'Warning', 'Critical', 'Offline'];

export default function BuildingOverview() {
  const [data, setData] = useState<BuildingDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      api.getBuildingDashboard().then(setData).catch(e => setError(e.message));
    };

    load();
    const timer = setInterval(load, 15000);
    const socket = connectWebSocket((message) => {
      if (message.channel !== 'dashboard') {
        return;
      }

      if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          load();
        }, 300);
      }
    });

    socket.subscribe('dashboard');

    return () => {
      clearInterval(timer);
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      socket.unsubscribe('dashboard');
      socket.close();
    };
  }, []);

  if (error) return <div className="text-red-400 p-4">Error: {error}</div>;
  if (!data) return <div className="text-slate-400 p-4">Loading...</div>;

  const statusData = [
    { name: 'Normal', value: data.totalDevices - (data.activeAnomalies.reduce((s, a) => s + parseInt(String(a.count)), 0)) },
    ...data.activeAnomalies.map(a => ({ name: a.severity, value: parseInt(String(a.count)) })),
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-400 text-sm">Total Devices</div>
          <div className="text-3xl font-bold text-white">{data.totalDevices}</div>
        </div>
        {data.activeAnomalies.map(a => (
          <div key={a.severity} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm capitalize">{a.severity} Alerts</div>
            <div className={`text-3xl font-bold ${
              a.severity === 'critical' ? 'text-red-400' : a.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
            }`}>{a.count}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Device Status Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Energy Consumption (24h)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.energyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => new Date(v).getHours() + ':00'} />
              <YAxis tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569' }} />
              <Line type="monotone" dataKey="total_kwh" stroke="#06b6d4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Floors</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 13 }, (_, i) => i).map(floor => {
            const typeCount = data.devicesByType.length;
            return (
              <Link key={floor} to={`/floor/${floor}`}
                className="bg-slate-700 hover:bg-slate-600 rounded p-3 transition-colors text-center">
                <div className="text-lg font-semibold">{floor === 0 ? 'B1' : `${floor}F`}</div>
                <div className="text-xs text-slate-400">Floor {floor}</div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Devices by Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.devicesByType.map(dt => (
            <div key={dt.device_type} className="bg-slate-700 rounded p-3">
              <div className="text-sm text-slate-400 capitalize">{dt.device_type.replace(/-/g, ' ')}</div>
              <div className="text-xl font-bold">{dt.count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

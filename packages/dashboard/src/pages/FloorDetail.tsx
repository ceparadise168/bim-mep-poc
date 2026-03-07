import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, FloorOverview, connectWebSocket } from '../api';

export default function FloorDetail() {
  const { floor } = useParams<{ floor: string }>();
  const [data, setData] = useState<FloorOverview | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!floor) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      api.getFloorOverview(parseInt(floor)).then(setData).catch(e => setError(e.message));
    };

    load();
    const timer = setInterval(load, 15000);
    const socket = connectWebSocket((message) => {
      if (message.channel !== `signals:floor:${floor}` && message.channel !== 'dashboard') {
        return;
      }

      if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          load();
        }, 300);
      }
    });

    socket.subscribe(`signals:floor:${floor}`);
    socket.subscribe('dashboard');

    return () => {
      clearInterval(timer);
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      socket.unsubscribe(`signals:floor:${floor}`);
      socket.unsubscribe('dashboard');
      socket.close();
    };
  }, [floor]);

  if (error) return <div className="text-red-400 p-4">Error: {error}</div>;
  if (!data) return <div className="text-slate-400 p-4">Loading...</div>;

  const filteredDevices = data.devices.filter(d =>
    !filter || d.device_type.includes(filter) || d.device_id.includes(filter.toUpperCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-cyan-400 hover:text-cyan-300">&larr; Back</Link>
        <h2 className="text-2xl font-bold">{parseInt(floor!) === 0 ? 'B1 (Basement)' : `${floor}F`}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-400 text-sm">Devices on Floor</div>
          <div className="text-3xl font-bold text-white">{data.deviceCount}</div>
        </div>
        {data.activeAnomalies.map(a => (
          <div key={a.severity} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm capitalize">{a.severity}</div>
            <div className={`text-3xl font-bold ${
              a.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
            }`}>{a.count}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Device List</h3>
          <input
            type="text"
            placeholder="Filter by type or ID..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-slate-700 text-white rounded px-3 py-1.5 text-sm border border-slate-600 focus:border-cyan-400 outline-none"
          />
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="text-left p-2">Device ID</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Zone</th>
                <th className="text-left p-2">Vendor</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map(d => (
                <tr key={d.device_id} className="border-t border-slate-700 hover:bg-slate-700">
                  <td className="p-2">
                    <Link to={`/device/${d.device_id}`} className="text-cyan-400 hover:text-cyan-300">
                      {d.device_id}
                    </Link>
                  </td>
                  <td className="p-2 capitalize">{d.device_type.replace(/-/g, ' ')}</td>
                  <td className="p-2">{d.zone}</td>
                  <td className="p-2">{d.vendor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

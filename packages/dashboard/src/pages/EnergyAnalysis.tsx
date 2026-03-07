import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api, EnergyAnalytics, ComfortAnalytics } from '../api';

export default function EnergyAnalysis() {
  const [energy, setEnergy] = useState<EnergyAnalytics | null>(null);
  const [comfort, setComfort] = useState<ComfortAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      api.getEnergyAnalytics().then(setEnergy).catch(e => setError(e.message));
      api.getComfortAnalytics().then(setComfort).catch(() => {});
    };
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Energy & Comfort Analysis</h2>

      {error && <div className="text-red-400 p-4">Error: {error}</div>}
      {!energy && !error && <div className="text-slate-400 p-4">Loading...</div>}
      {energy && <>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Floor EUI Comparison */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Energy by Floor (kWh)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={energy.floorEnergy}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="floor" tick={{ fill: '#94a3b8' }} tickFormatter={v => `${v}F`} />
              <YAxis tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569' }} />
              <Bar dataKey="total_kwh" fill="#06b6d4" radius={[4, 4, 0, 0]} name="kWh" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* COP Trend */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Chiller COP Trend (24h)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={energy.copTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => new Date(v).getHours() + ':00'} />
              <YAxis tick={{ fill: '#94a3b8' }} domain={[0, 6]} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569' }} />
              <Line type="monotone" dataKey="avg_cop" stroke="#22c55e" strokeWidth={2} dot={false} name="COP" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comfort Analysis */}
      {comfort && comfort.floorComfort.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Floor Comfort Metrics</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="text-left p-2">Floor</th>
                  <th className="text-left p-2">Avg Temp (C)</th>
                  <th className="text-left p-2">Avg Humidity (%RH)</th>
                  <th className="text-left p-2">Avg CO2 (ppm)</th>
                  <th className="text-left p-2">Comfort Score</th>
                </tr>
              </thead>
              <tbody>
                {comfort.floorComfort.map(fc => {
                  const temp = fc.avg_temp ?? 0;
                  const hum = fc.avg_humidity ?? 0;
                  const co2 = fc.avg_co2 ?? 0;
                  const tempScore = Math.max(0, 100 - Math.abs(temp - 23) * 10);
                  const humScore = Math.max(0, 100 - Math.abs(hum - 50) * 2);
                  const co2Score = Math.max(0, 100 - Math.max(0, co2 - 400) * 0.1);
                  const comfortScore = Math.round((tempScore * 0.4 + humScore * 0.3 + co2Score * 0.3) * 10) / 10;

                  return (
                    <tr key={fc.floor} className="border-t border-slate-700">
                      <td className="p-2 font-medium">{fc.floor}F</td>
                      <td className="p-2">{temp?.toFixed(1) ?? '-'}</td>
                      <td className="p-2">{hum?.toFixed(1) ?? '-'}</td>
                      <td className="p-2">{co2?.toFixed(0) ?? '-'}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                comfortScore > 75 ? 'bg-green-500' : comfortScore > 50 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${comfortScore}%` }}
                            />
                          </div>
                          <span className="text-xs">{comfortScore}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

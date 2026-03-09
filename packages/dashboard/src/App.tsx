import { Routes, Route, Link, useLocation } from 'react-router-dom';
import BuildingOverview from './pages/BuildingOverview';
import FloorDetail from './pages/FloorDetail';
import DeviceDetail from './pages/DeviceDetail';
import AnomalyCenter from './pages/AnomalyCenter';
import EnergyAnalysis from './pages/EnergyAnalysis';
import AboutProject from './pages/AboutProject';
import Building3DView from './pages/Building3DView';

const navItems = [
  { path: '/', label: 'Building Overview' },
  { path: '/anomalies', label: 'Anomaly Center' },
  { path: '/energy', label: 'Energy Analysis' },
  { path: '/3d', label: '3D View' },
  { path: '/about', label: 'About' },
];

export default function App() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="bg-slate-800 border-b border-slate-700 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <h1 className="text-lg sm:text-xl font-bold text-cyan-400 whitespace-nowrap shrink-0">BIM MEP</h1>
          <div className="flex gap-2 sm:gap-4 overflow-x-auto scrollbar-hide">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm transition-colors whitespace-nowrap ${
                  location.pathname === item.path
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className={`mx-auto ${location.pathname === '/3d' ? 'max-w-full' : 'px-6 py-6 max-w-7xl'}`}>
        <Routes>
          <Route path="/" element={<BuildingOverview />} />
          <Route path="/floor/:floor" element={<FloorDetail />} />
          <Route path="/device/:id" element={<DeviceDetail />} />
          <Route path="/anomalies" element={<AnomalyCenter />} />
          <Route path="/energy" element={<EnergyAnalysis />} />
          <Route path="/3d" element={<Building3DView />} />
          <Route path="/about" element={<AboutProject />} />
        </Routes>
      </main>
    </div>
  );
}

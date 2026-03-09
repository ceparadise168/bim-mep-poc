# 3D Building Real-Time Anomaly Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/3d` page showing a transparent 3D building with 474 device spheres that pulse when anomalous, updated in real-time via WebSocket.

**Architecture:** Single new page component using React Three Fiber. Loads device list from REST API on mount, subscribes to WebSocket `anomalies` channel for live updates. All 3D components are R3F declarative components driven by React state.

**Tech Stack:** React Three Fiber, @react-three/drei, Three.js, existing WebSocket infrastructure, Tailwind CSS for tooltip/sidebar.

---

### Task 1: Install 3D dependencies

**Files:**
- Modify: `packages/dashboard/package.json`

**Step 1: Install packages**

```bash
cd packages/dashboard && npm install three @react-three/fiber @react-three/drei && npm install -D @types/three
```

**Step 2: Verify install**

```bash
cd packages/dashboard && node -e "require('three'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add packages/dashboard/package.json packages/dashboard/package-lock.json
git commit -m "feat(dashboard): add three.js and react-three-fiber dependencies"
```

---

### Task 2: Create the Building3DView page with Canvas and data loading

**Files:**
- Create: `packages/dashboard/src/pages/Building3DView.tsx`
- Modify: `packages/dashboard/src/App.tsx`

**Step 1: Create Building3DView.tsx**

This is the main page. It handles data loading and WebSocket subscription, then passes data to 3D sub-components. For this task, render just the Canvas with OrbitControls and a placeholder box to verify the setup works.

```tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { api, Device, Anomaly, connectWebSocket } from '../api';

interface DeviceWithGeometry extends Device {
  geometry: {
    position: { x: number; y: number; z: number };
    dimensions: Record<string, number>;
  };
}

export default function Building3DView() {
  const [devices, setDevices] = useState<DeviceWithGeometry[]>([]);
  const [anomalyMap, setAnomalyMap] = useState<Map<string, Anomaly>>(new Map());
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load all devices (paginated API, fetch all pages)
    async function loadDevices() {
      try {
        let allDevices: DeviceWithGeometry[] = [];
        let page = 1;
        while (true) {
          const result = await api.getDevices({ page: String(page), limit: '200' });
          allDevices = allDevices.concat(result.devices as DeviceWithGeometry[]);
          if (allDevices.length >= result.total) break;
          page++;
        }
        setDevices(allDevices);
      } catch (e: unknown) {
        setError((e as Error).message);
      }
    }
    loadDevices();
  }, []);

  useEffect(() => {
    // Load initial anomalies
    api.getAnomalies({ state: 'firing' }).then(anomalies => {
      const map = new Map<string, Anomaly>();
      for (const a of anomalies) map.set(a.device_id, a);
      setAnomalyMap(map);
    }).catch(() => {});

    // Subscribe to real-time anomaly updates
    const socket = connectWebSocket((message) => {
      if (message.channel !== 'anomalies' || !message.data || typeof message.data !== 'object') return;
      const data = message.data as Partial<Anomaly>;
      if (!data.device_id) return;

      setAnomalyMap(prev => {
        const next = new Map(prev);
        if (data.state === 'resolved') {
          next.delete(data.device_id!);
        } else {
          next.set(data.device_id!, {
            id: data.id ?? Date.now(),
            fingerprint: data.fingerprint ?? '',
            device_id: data.device_id!,
            anomaly_type: data.anomaly_type ?? 'unknown',
            severity: data.severity ?? 'warning',
            state: data.state ?? 'firing',
            message: data.message ?? '',
            detected_at: data.detected_at ?? new Date().toISOString(),
            fired_at: data.fired_at,
            resolved_at: data.resolved_at,
            occurrence_count: data.occurrence_count ?? 1,
            metadata: data.metadata,
          });
        }
        return next;
      });
    });
    socket.subscribe('anomalies');

    return () => {
      socket.unsubscribe('anomalies');
      socket.close();
    };
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedDevice(null);
  }, []);

  if (error) return <div className="text-red-400 p-4">Error: {error}</div>;

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]">
      {/* 3D Canvas */}
      <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <Canvas
          camera={{ position: [60, 40, 60], fov: 50 }}
          onPointerMissed={handleCanvasClick}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[50, 50, 50]} intensity={0.8} />
          <OrbitControls
            enableDamping
            dampingFactor={0.1}
            minDistance={20}
            maxDistance={150}
          />
          {/* Placeholder — will be replaced in Task 3 */}
          <mesh>
            <boxGeometry args={[40, 55, 30]} />
            <meshStandardMaterial color="#06b6d4" transparent opacity={0.05} />
          </mesh>
          <gridHelper args={[80, 20, '#334155', '#1e293b']} />
        </Canvas>
      </div>

      {/* Side panel — anomaly list */}
      <div className="w-72 bg-slate-800 rounded-lg border border-slate-700 p-4 overflow-auto">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Live Anomalies ({anomalyMap.size})
        </h3>
        <div className="space-y-2">
          {anomalyMap.size === 0 ? (
            <div className="text-slate-500 text-xs text-center py-4">No active anomalies</div>
          ) : (
            Array.from(anomalyMap.values()).map(a => (
              <button
                key={a.fingerprint || a.id}
                onClick={() => setSelectedDevice(a.device_id)}
                className={`w-full text-left bg-slate-700 rounded p-2 text-xs transition-colors hover:bg-slate-600 ${
                  selectedDevice === a.device_id ? 'ring-1 ring-cyan-500' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <span className="font-medium text-slate-200">{a.device_id}</span>
                  <span className="text-slate-400 capitalize">{a.anomaly_type}</span>
                </div>
                <div className="text-slate-400 truncate mt-0.5">{a.message}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add route to App.tsx**

In `packages/dashboard/src/App.tsx`, add the import and route:

- Add import: `import Building3DView from './pages/Building3DView';`
- Add to navItems array: `{ path: '/3d', label: '3D View' }`
- Add Route: `<Route path="/3d" element={<Building3DView />} />`

Note: The `/3d` page is fullscreen-ish (uses `h-[calc(100vh-80px)]`), but the `<main>` wrapper has `max-w-7xl` constraint. To make the 3D view wider, wrap the Route conditionally or remove the max-width for the 3D route. Simplest approach: add a conditional className on `<main>`:

```tsx
<main className={`mx-auto px-6 py-6 ${location.pathname === '/3d' ? 'max-w-full' : 'max-w-7xl'}`}>
```

**Step 3: Verify**

```bash
cd packages/dashboard && npx tsc --noEmit
```
Expected: No type errors

**Step 4: Rebuild and test in browser**

```bash
docker compose build dashboard && docker compose up -d dashboard
```

Visit `http://localhost:5173/3d` — should see a cyan transparent box with grid, orbit controls working, and right sidebar.

**Step 5: Commit**

```bash
git add packages/dashboard/src/pages/Building3DView.tsx packages/dashboard/src/App.tsx
git commit -m "feat(dashboard): add 3D view page with canvas, orbit controls, and anomaly sidebar"
```

---

### Task 3: Build transparent floor plates

**Files:**
- Create: `packages/dashboard/src/components/3d/BuildingModel.tsx`
- Modify: `packages/dashboard/src/pages/Building3DView.tsx` — replace placeholder box

**Step 1: Create BuildingModel.tsx**

```tsx
import { useMemo } from 'react';
import * as THREE from 'three';

const FLOOR_HEIGHT = 4.2;
const FLOOR_WIDTH = 40;
const FLOOR_DEPTH = 30;
const TOTAL_FLOORS = 13; // B1 (0) + 1F-12F

function FloorPlate({ floor }: { floor: number }) {
  const y = floor * FLOOR_HEIGHT;
  const label = floor === 0 ? 'B1' : `${floor}F`;

  const edges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(FLOOR_WIDTH, 0.15, FLOOR_DEPTH);
    return new THREE.EdgesGeometry(geometry);
  }, []);

  return (
    <group position={[FLOOR_WIDTH / 2, y, FLOOR_DEPTH / 2]}>
      {/* Transparent floor slab */}
      <mesh>
        <boxGeometry args={[FLOOR_WIDTH, 0.15, FLOOR_DEPTH]} />
        <meshStandardMaterial
          color="#06b6d4"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Wireframe edges */}
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#0e7490" transparent opacity={0.3} />
      </lineSegments>
    </group>
  );
}

export default function BuildingModel() {
  return (
    <group>
      {Array.from({ length: TOTAL_FLOORS }, (_, i) => (
        <FloorPlate key={i} floor={i} />
      ))}
    </group>
  );
}
```

**Step 2: Update Building3DView.tsx**

Replace the placeholder `<mesh>` with `<BuildingModel />`:

- Add import: `import BuildingModel from '../components/3d/BuildingModel';`
- Remove the placeholder `<mesh>...</mesh>` block
- Add `<BuildingModel />` inside the Canvas

**Step 3: Verify types**

```bash
cd packages/dashboard && npx tsc --noEmit
```

**Step 4: Rebuild and check**

```bash
docker compose build dashboard && docker compose up -d dashboard
```

Visit `http://localhost:5173/3d` — should see 13 stacked transparent cyan floor plates.

**Step 5: Commit**

```bash
git add packages/dashboard/src/components/3d/BuildingModel.tsx packages/dashboard/src/pages/Building3DView.tsx
git commit -m "feat(dashboard): add transparent floor plates to 3D building"
```

---

### Task 4: Render device spheres

**Files:**
- Create: `packages/dashboard/src/components/3d/DevicePoints.tsx`
- Modify: `packages/dashboard/src/pages/Building3DView.tsx` — add DevicePoints

**Step 1: Create DevicePoints.tsx**

Uses instanced rendering for performance (474 spheres).

```tsx
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Anomaly } from '../api';

interface DeviceData {
  device_id: string;
  device_type: string;
  floor: number;
  zone: string;
  geometry: {
    position: { x: number; y: number; z: number };
  };
}

interface DevicePointsProps {
  devices: DeviceData[];
  anomalyMap: Map<string, Anomaly>;
  selectedDevice: string | null;
  onSelectDevice: (deviceId: string | null) => void;
}

const SEVERITY_COLORS: Record<string, THREE.Color> = {
  critical: new THREE.Color('#ef4444'),
  warning: new THREE.Color('#f59e0b'),
  info: new THREE.Color('#3b82f6'),
};

const NORMAL_COLOR = new THREE.Color('#4ade80');
const PENDING_COLOR = new THREE.Color('#facc15');
const SELECTED_COLOR = new THREE.Color('#06b6d4');

function DeviceSphere({
  device,
  anomaly,
  isSelected,
  onSelect,
}: {
  device: DeviceData;
  anomaly?: Anomaly;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pos = device.geometry.position;

  const color = isSelected
    ? SELECTED_COLOR
    : anomaly
      ? anomaly.state === 'pending'
        ? PENDING_COLOR
        : SEVERITY_COLORS[anomaly.severity] ?? NORMAL_COLOR
      : NORMAL_COLOR;

  // Gentle hover glow via emissive
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (anomaly && anomaly.state !== 'resolved') {
      // Pulsing emissive for anomalous devices
      const pulse = (Math.sin(Date.now() * (anomaly.severity === 'critical' ? 0.008 : 0.004)) + 1) / 2;
      mat.emissiveIntensity = 0.3 + pulse * 0.7;
    } else {
      mat.emissiveIntensity = 0.1;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[pos.x, pos.y + 0.5, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.1}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

export default function DevicePoints({ devices, anomalyMap, selectedDevice, onSelectDevice }: DevicePointsProps) {
  return (
    <group>
      {devices.map(device => (
        <DeviceSphere
          key={device.device_id}
          device={device}
          anomaly={anomalyMap.get(device.device_id)}
          isSelected={selectedDevice === device.device_id}
          onSelect={() => onSelectDevice(device.device_id)}
        />
      ))}
    </group>
  );
}
```

**Step 2: Update Building3DView.tsx**

- Add import: `import DevicePoints from '../components/3d/DevicePoints';`
- Add inside Canvas, after `<BuildingModel />`:
```tsx
<DevicePoints
  devices={devices}
  anomalyMap={anomalyMap}
  selectedDevice={selectedDevice}
  onSelectDevice={setSelectedDevice}
/>
```

**Step 3: Verify types**

```bash
cd packages/dashboard && npx tsc --noEmit
```

**Step 4: Rebuild and check**

```bash
docker compose build dashboard && docker compose up -d dashboard
```

Visit `http://localhost:5173/3d` — should see green/colored spheres on each floor.

**Step 5: Commit**

```bash
git add packages/dashboard/src/components/3d/DevicePoints.tsx packages/dashboard/src/pages/Building3DView.tsx
git commit -m "feat(dashboard): add device spheres to 3D building view"
```

---

### Task 5: Add anomaly pulse ring animations

**Files:**
- Create: `packages/dashboard/src/components/3d/AnomalyPulses.tsx`
- Modify: `packages/dashboard/src/pages/Building3DView.tsx` — add AnomalyPulses

**Step 1: Create AnomalyPulses.tsx**

```tsx
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Anomaly } from '../api';

interface DevicePosition {
  device_id: string;
  geometry: { position: { x: number; y: number; z: number } };
}

interface AnomalyPulsesProps {
  devices: DevicePosition[];
  anomalyMap: Map<string, Anomaly>;
}

const SEVERITY_CONFIG: Record<string, { color: string; maxRadius: number; speed: number }> = {
  critical: { color: '#ef4444', maxRadius: 5, speed: 2.0 },
  warning: { color: '#f59e0b', maxRadius: 3, speed: 1.2 },
  info: { color: '#3b82f6', maxRadius: 2, speed: 0.8 },
};

function PulseRing({ position, severity }: { position: [number, number, number]; severity: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.warning;

  useFrame(() => {
    if (!ringRef.current) return;
    const t = (Date.now() * config.speed * 0.001) % 1; // 0-1 loop
    const scale = 0.1 + t * config.maxRadius;
    ringRef.current.scale.set(scale, scale, scale);
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.5 * (1 - t);
  });

  return (
    <mesh
      ref={ringRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial
        color={config.color}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function AnomalyPulses({ devices, anomalyMap }: AnomalyPulsesProps) {
  const activeAnomalies = devices.filter(d => {
    const a = anomalyMap.get(d.device_id);
    return a && a.state !== 'resolved';
  });

  return (
    <group>
      {activeAnomalies.map(device => {
        const anomaly = anomalyMap.get(device.device_id)!;
        const pos = device.geometry.position;
        return (
          <PulseRing
            key={device.device_id}
            position={[pos.x, pos.y + 0.5, pos.z]}
            severity={anomaly.severity}
          />
        );
      })}
    </group>
  );
}
```

**Step 2: Update Building3DView.tsx**

- Add import: `import AnomalyPulses from '../components/3d/AnomalyPulses';`
- Add inside Canvas, after `<DevicePoints ... />`:
```tsx
<AnomalyPulses devices={devices} anomalyMap={anomalyMap} />
```

**Step 3: Verify types**

```bash
cd packages/dashboard && npx tsc --noEmit
```

**Step 4: Rebuild and check**

```bash
docker compose build dashboard && docker compose up -d dashboard
```

Visit `http://localhost:5173/3d` — trigger a fault injection from Anomaly Center, then return to 3D view. Should see red/amber pulse rings on affected devices.

**Step 5: Commit**

```bash
git add packages/dashboard/src/components/3d/AnomalyPulses.tsx packages/dashboard/src/pages/Building3DView.tsx
git commit -m "feat(dashboard): add earthquake-style pulse rings for anomalous devices"
```

---

### Task 6: Add device click tooltip

**Files:**
- Create: `packages/dashboard/src/components/3d/DeviceTooltip.tsx`
- Modify: `packages/dashboard/src/pages/Building3DView.tsx` — add DeviceTooltip

**Step 1: Create DeviceTooltip.tsx**

```tsx
import { Html } from '@react-three/drei';
import { Link } from 'react-router-dom';
import type { Anomaly } from '../api';

interface DeviceData {
  device_id: string;
  device_type: string;
  floor: number;
  zone: string;
  geometry: { position: { x: number; y: number; z: number } };
}

interface DeviceTooltipProps {
  device: DeviceData;
  anomaly?: Anomaly;
  onClose: () => void;
}

export default function DeviceTooltip({ device, anomaly, onClose }: DeviceTooltipProps) {
  const pos = device.geometry.position;
  const floorLabel = device.floor === 0 ? 'B1' : `${device.floor}F`;

  return (
    <Html
      position={[pos.x, pos.y + 2, pos.z]}
      center
      distanceFactor={40}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl min-w-[200px] text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-cyan-400">{device.device_id}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">✕</button>
        </div>
        <div className="space-y-1 text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">Type</span>
            <span className="capitalize">{device.device_type.replace(/-/g, ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Floor</span>
            <span>{floorLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Zone</span>
            <span>{device.zone}</span>
          </div>
          {anomaly && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  anomaly.severity === 'critical' ? 'bg-red-500' :
                  anomaly.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                <span className={`font-medium ${
                  anomaly.severity === 'critical' ? 'text-red-400' :
                  anomaly.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                }`}>
                  {anomaly.severity} — {anomaly.anomaly_type}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{anomaly.message}</div>
            </div>
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-slate-700">
          <Link
            to={`/device/${device.device_id}`}
            className="text-cyan-400 hover:text-cyan-300 text-xs"
          >
            View Details →
          </Link>
        </div>
      </div>
    </Html>
  );
}
```

**Step 2: Update Building3DView.tsx**

- Add import: `import DeviceTooltip from '../components/3d/DeviceTooltip';`
- Find the selected device and render tooltip inside Canvas, after AnomalyPulses:
```tsx
{selectedDevice && (() => {
  const device = devices.find(d => d.device_id === selectedDevice);
  if (!device) return null;
  return (
    <DeviceTooltip
      device={device}
      anomaly={anomalyMap.get(selectedDevice)}
      onClose={() => setSelectedDevice(null)}
    />
  );
})()}
```

**Step 3: Verify types**

```bash
cd packages/dashboard && npx tsc --noEmit
```

**Step 4: Rebuild and test**

```bash
docker compose build dashboard && docker compose up -d dashboard
```

Visit `http://localhost:5173/3d`, click a device sphere — tooltip should appear with device info. Click ✕ or empty space to dismiss.

**Step 5: Commit**

```bash
git add packages/dashboard/src/components/3d/DeviceTooltip.tsx packages/dashboard/src/pages/Building3DView.tsx
git commit -m "feat(dashboard): add click tooltip for 3D device spheres"
```

---

### Task 7: Final polish — floor labels, camera position, loading state

**Files:**
- Modify: `packages/dashboard/src/components/3d/BuildingModel.tsx` — add floor labels
- Modify: `packages/dashboard/src/pages/Building3DView.tsx` — loading state, camera tuning

**Step 1: Add floor labels to BuildingModel.tsx**

Add `Html` import from drei. Inside each `FloorPlate`, after the wireframe edges, add:

```tsx
<Html
  position={[-FLOOR_WIDTH / 2 - 1, 0, 0]}
  center
  distanceFactor={80}
  style={{ pointerEvents: 'none' }}
>
  <span className="text-cyan-400 text-xs font-mono opacity-60 select-none">{label}</span>
</Html>
```

**Step 2: Add loading state to Building3DView.tsx**

Before the Canvas `<div>`, if `devices.length === 0` and no error, show a loading indicator:

```tsx
{devices.length === 0 && !error && (
  <div className="absolute inset-0 flex items-center justify-center z-10">
    <div className="text-slate-400 text-sm">Loading building data...</div>
  </div>
)}
```

Wrap the Canvas area div with `relative`:
```tsx
<div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden relative">
```

**Step 3: Verify types and rebuild**

```bash
cd packages/dashboard && npx tsc --noEmit
docker compose build dashboard && docker compose up -d dashboard
```

**Step 4: Full end-to-end test**

1. Visit `http://localhost:5173/3d` — see 13 transparent floors with labels
2. Rotate/zoom the building
3. See green device dots on each floor
4. Go to Anomaly Center, trigger fault injection
5. Return to 3D View — anomalous devices should pulse red/amber
6. Click a device — tooltip shows
7. Click "View Details →" — navigates to device page

**Step 5: Commit**

```bash
git add packages/dashboard/src/components/3d/BuildingModel.tsx packages/dashboard/src/pages/Building3DView.tsx
git commit -m "feat(dashboard): add floor labels, loading state, and polish 3D view"
```

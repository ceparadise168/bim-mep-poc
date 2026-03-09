import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { api, connectWebSocket } from '../api';
import type { Device, Anomaly } from '../api';
import { formatDeviceType, formatFloor, SEVERITY_TEXT_COLORS, SEVERITY_DOT_COLORS } from '../utils';

// ---- Constants ----
const FLOOR_HEIGHT = 4.2;
const FLOOR_WIDTH = 40;
const FLOOR_DEPTH = 30;
const TOTAL_FLOORS = 13;

const SEVERITY_CONFIG: Record<string, { color: string; maxRadius: number; speed: number }> = {
  critical: { color: '#ef4444', maxRadius: 5, speed: 2.0 },
  warning: { color: '#f59e0b', maxRadius: 3, speed: 1.2 },
  info: { color: '#3b82f6', maxRadius: 2, speed: 0.8 },
};

// ---- Helpers ----
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function devicePosition(d: Device): [number, number, number] {
  const h = hashCode(d.device_id);
  const x = 5 + (h % 30);
  const z = 5 + ((h >> 8) % 20);
  const y = d.floor * FLOOR_HEIGHT + 0.5;
  return [x, y, z];
}

// ---- 3D Components (inside Canvas) ----

function FloorPlate({ floor }: { floor: number }) {
  const y = floor * FLOOR_HEIGHT;
  const label = formatFloor(floor);
  const edges = useMemo(() => {
    const geo = new THREE.BoxGeometry(FLOOR_WIDTH, 0.15, FLOOR_DEPTH);
    const e = new THREE.EdgesGeometry(geo);
    geo.dispose();
    return e;
  }, []);

  return (
    <group position={[FLOOR_WIDTH / 2, y, FLOOR_DEPTH / 2]}>
      <mesh>
        <boxGeometry args={[FLOOR_WIDTH, 0.15, FLOOR_DEPTH]} />
        <meshStandardMaterial color="#06b6d4" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <lineSegments geometry={edges as any}>
        <lineBasicMaterial color="#0e7490" transparent opacity={0.3} />
      </lineSegments>
      <Html position={[-FLOOR_WIDTH / 2 - 1, 0, 0]} center style={{ pointerEvents: 'none' }}>
        <span className="text-cyan-400 text-xs font-mono opacity-60 select-none">{label}</span>
      </Html>
    </group>
  );
}

function DeviceSphere({
  device,
  position,
  color,
  isAnomalous,
  isSelected,
  speed,
  onClick,
  onHover,
  onUnhover,
}: {
  device: Device;
  position: [number, number, number];
  color: string;
  isAnomalous: boolean;
  isSelected: boolean;
  speed: number;
  onClick: () => void;
  onHover: (device: Device) => void;
  onUnhover: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meshRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (isAnomalous) {
      mat.emissiveIntensity = 0.5 + 0.5 * Math.sin(clock.elapsedTime * speed);
    } else {
      mat.emissiveIntensity = isSelected ? 0.6 : 0;
    }
    // Smooth scale transition for selected state
    const target = isSelected ? 1.8 : 1;
    const current = meshRef.current.scale.x;
    const next = THREE.MathUtils.lerp(current, target, 0.1);
    meshRef.current.scale.setScalar(next);
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover(device); }}
      onPointerOut={() => { document.body.style.cursor = 'default'; onUnhover(); }}
    >
      <sphereGeometry args={[0.4, 12, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0} transparent opacity={0.9} />
    </mesh>
  );
}

function PulseRing({ position, config }: { position: [number, number, number]; config: { color: string; maxRadius: number; speed: number } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meshRef = useRef<any>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const phase = (performance.now() * config.speed * 0.001) % 1;
    const scale = 0.1 + phase * config.maxRadius;
    meshRef.current.scale.set(scale, scale, 1);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - phase);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial color={config.color} transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// Leader line + callout card for selected device
function LeaderLineCallout({
  device,
  position,
  anomaly,
  onClose,
}: {
  device: Device;
  position: [number, number, number];
  anomaly?: Anomaly;
  onClose: () => void;
}) {
  const [px, py, pz] = position;

  // Elbow leader line: device → up → out to left of building
  const elbowY = py + 4;
  const anchorX = -6;
  const anchorY = elbowY;
  const anchorZ = pz;

  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const points = [
      px, py, pz,           // start at device
      px, elbowY, pz,       // go up
      anchorX, anchorY, anchorZ, // go out left
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#06b6d4', transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    return line;
  }, [px, py, pz, elbowY, anchorX, anchorY, anchorZ]);

  return (
    <group>
      {/* Leader line */}
      <primitive object={lineObj} />

      {/* Small dot at device end */}
      <mesh position={[px, py, pz]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color="#06b6d4" />
      </mesh>

      {/* Small dot at anchor end */}
      <mesh position={[anchorX, anchorY, anchorZ]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#06b6d4" />
      </mesh>

      {/* Callout card at anchor end */}
      <Html
        position={[anchorX, anchorY, anchorZ]}
        style={{ pointerEvents: 'auto', transform: 'translate(0, -50%)' }}
      >
        <div
          className="bg-slate-800/95 border border-cyan-500/50 rounded-lg shadow-2xl min-w-[220px] p-3 text-sm text-slate-200 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ borderLeft: '3px solid #06b6d4' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-cyan-400">{device.device_id}</span>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xs ml-4">&#10005;</button>
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="capitalize">{formatDeviceType(device.device_type)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Floor</span><span>{formatFloor(device.floor)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Zone</span><span>{device.zone}</span></div>
          </div>
          {anomaly && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT_COLORS[anomaly.severity] ?? 'bg-blue-500'}`} />
                <span className="font-medium text-xs capitalize">{anomaly.severity} - {anomaly.anomaly_type}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{anomaly.message}</div>
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-slate-700">
            <a href={`/device/${device.device_id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">
              View Details &rarr;
            </a>
          </div>
        </div>
      </Html>
    </group>
  );
}

// Camera fly-to animation
function CameraAnimator({ target }: { target: [number, number, number] | null }) {
  const { camera } = useThree();
  const targetRef = useRef<[number, number, number] | null>(null);
  const goalPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!target) return;
    targetRef.current = target;
    // Position camera offset from the device
    goalPos.current.set(target[0] + 15, target[1] + 10, target[2] + 15);
  }, [target]);

  useFrame(() => {
    if (!targetRef.current) return;
    const goal = goalPos.current;
    camera.position.lerp(goal, 0.04);
    // Stop animating when close enough
    if (camera.position.distanceTo(goal) < 0.5) {
      targetRef.current = null;
    }
  });

  return null;
}

function Scene({
  devices,
  anomalyMap,
  selectedDeviceId,
  hoveredDevice,
  flyToTarget,
  onSelectDevice,
  onHoverDevice,
  onUnhoverDevice,
}: {
  devices: Device[];
  anomalyMap: Map<string, Anomaly>;
  selectedDeviceId: string | null;
  hoveredDevice: Device | null;
  flyToTarget: [number, number, number] | null;
  onSelectDevice: (id: string | null) => void;
  onHoverDevice: (device: Device) => void;
  onUnhoverDevice: () => void;
}) {
  // Memoize position map to avoid recomputing hashes on every render
  const positionMap = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    for (const d of devices) m.set(d.device_id, devicePosition(d));
    return m;
  }, [devices]);

  const selectedDevice = devices.find(d => d.device_id === selectedDeviceId);
  const selectedAnomaly = selectedDeviceId ? anomalyMap.get(selectedDeviceId) : undefined;

  // Show hover tooltip (lightweight label)
  const hoverAnomaly = hoveredDevice ? anomalyMap.get(hoveredDevice.device_id) : undefined;
  const hoverPos = hoveredDevice ? positionMap.get(hoveredDevice.device_id) : undefined;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[50, 50, 50]} intensity={0.8} />
      <gridHelper args={[80, 20, '#334155', '#1e293b']} />
      <OrbitControls enableDamping dampingFactor={0.1} minDistance={20} maxDistance={150} />
      <CameraAnimator target={flyToTarget} />

      {/* Floor plates */}
      {Array.from({ length: TOTAL_FLOORS }, (_, i) => (
        <FloorPlate key={i} floor={i} />
      ))}

      {/* Device spheres */}
      {devices.map(device => {
        const anomaly = anomalyMap.get(device.device_id);
        const isSelected = selectedDeviceId === device.device_id;
        const color = isSelected
          ? '#06b6d4'
          : anomaly
            ? (SEVERITY_CONFIG[anomaly.severity]?.color ?? '#3b82f6')
            : '#4ade80';
        const speed = anomaly?.severity === 'critical' ? 8 : 4;

        return (
          <DeviceSphere
            key={device.device_id}
            device={device}
            position={positionMap.get(device.device_id)!}
            color={color}
            isAnomalous={!!anomaly}
            isSelected={isSelected}
            speed={speed}
            onClick={() => onSelectDevice(device.device_id)}
            onHover={onHoverDevice}
            onUnhover={onUnhoverDevice}
          />
        );
      })}

      {/* Pulse rings for anomalous devices */}
      {devices.filter(d => anomalyMap.has(d.device_id)).map(device => {
        const anomaly = anomalyMap.get(device.device_id)!;
        const config = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.warning;
        return (
          <PulseRing key={`pulse-${device.device_id}`} position={positionMap.get(device.device_id)!} config={config} />
        );
      })}

      {/* Hover tooltip — lightweight label that follows the hovered device */}
      {hoveredDevice && hoverPos && hoveredDevice.device_id !== selectedDeviceId && (
        <Html
          position={[hoverPos[0], hoverPos[1] + 1.5, hoverPos[2]]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-slate-900/90 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 whitespace-nowrap shadow-lg backdrop-blur-sm">
            <span className="font-bold text-cyan-400">{hoveredDevice.device_id}</span>
            <span className="text-slate-400 ml-2">{formatDeviceType(hoveredDevice.device_type)}</span>
            <span className="text-slate-500 ml-2">{formatFloor(hoveredDevice.floor)}</span>
            {hoverAnomaly && (
              <span className={`ml-2 ${SEVERITY_TEXT_COLORS[hoverAnomaly.severity] ?? 'text-blue-400'}`}>
                {hoverAnomaly.severity}
              </span>
            )}
          </div>
        </Html>
      )}

      {/* Leader line callout for selected device */}
      {selectedDevice && (
        <LeaderLineCallout
          device={selectedDevice}
          position={positionMap.get(selectedDevice.device_id)!}
          anomaly={selectedAnomaly}
          onClose={() => onSelectDevice(null)}
        />
      )}
    </>
  );
}

// ---- Main Page Component ----
export default function Building3DView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [anomalyMap, setAnomalyMap] = useState<Map<string, Anomaly>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<Device | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<[number, number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load all devices
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allDevices: Device[] = [];
        let page = 1;
        while (true) {
          const result = await api.getDevices({ page: String(page), limit: '200' });
          allDevices.push(...result.devices);
          if (allDevices.length >= result.total) break;
          page++;
        }
        if (!cancelled) setDevices(allDevices);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load initial anomalies + WebSocket subscription
  useEffect(() => {
    Promise.all([
      api.getAnomalies({ state: 'firing' }),
      api.getAnomalies({ state: 'pending' }),
    ]).then(([firing, pending]) => {
      const map = new Map<string, Anomaly>();
      for (const a of [...firing, ...pending]) map.set(a.device_id, a);
      setAnomalyMap(map);
    }).catch(() => {});

    const ws = connectWebSocket(({ channel, data }) => {
      if (channel !== 'anomalies' || !data || typeof data !== 'object') return;
      const d = data as Partial<Anomaly>;
      if (!d.device_id) return;
      setAnomalyMap(prev => {
        const next = new Map(prev);
        if (d.state === 'resolved') {
          next.delete(d.device_id!);
        } else {
          next.set(d.device_id!, {
            id: d.id ?? Date.now(),
            fingerprint: d.fingerprint ?? '',
            device_id: d.device_id!,
            anomaly_type: d.anomaly_type ?? 'unknown',
            severity: d.severity ?? 'warning',
            state: d.state ?? 'firing',
            message: d.message ?? '',
            detected_at: d.detected_at ?? new Date().toISOString(),
            occurrence_count: d.occurrence_count ?? 1,
            metadata: d.metadata,
          });
        }
        return next;
      });
    });
    ws.subscribe('anomalies');
    return () => { ws.unsubscribe('anomalies'); ws.close(); };
  }, []);

  const handlePointerMissed = useCallback(() => setSelectedDeviceId(null), []);
  const handleUnhover = useCallback(() => setHoveredDevice(null), []);

  // O(1) device lookup map
  const deviceMap = useMemo(
    () => new Map(devices.map(d => [d.device_id, d])),
    [devices]
  );

  // Select device from sidebar — also trigger camera fly-to
  const handleSidebarSelect = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const device = deviceMap.get(deviceId);
    if (device) {
      setFlyToTarget(devicePosition(device));
    }
  }, [deviceMap]);

  const anomalyList = useMemo(() => {
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return Array.from(anomalyMap.values()).sort(
      (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    );
  }, [anomalyMap]);

  // Mobile bottom panel toggle
  const [panelOpen, setPanelOpen] = useState(false);

  if (error) return <div className="text-red-400 p-4">Error: {error}</div>;

  const anomalyListContent = (
    <>
      {anomalyList.map(anomaly => {
        const device = deviceMap.get(anomaly.device_id);
        return (
          <button
            key={anomaly.fingerprint || anomaly.device_id}
            className={`w-full text-left p-2 rounded border transition-colors ${
              selectedDeviceId === anomaly.device_id
                ? 'border-cyan-500 bg-slate-700'
                : 'border-slate-700 bg-slate-800 hover:border-slate-600'
            }`}
            onClick={() => { handleSidebarSelect(anomaly.device_id); setPanelOpen(false); }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT_COLORS[anomaly.severity] ?? 'bg-blue-500'}`} />
              <span className="text-white text-xs font-medium truncate">{anomaly.device_id}</span>
            </div>
            <div className="text-slate-400 text-xs truncate">{anomaly.anomaly_type}</div>
            {device && (
              <div className="text-slate-500 text-xs mt-0.5">{formatFloor(device.floor)} &middot; {device.zone}</div>
            )}
          </button>
        );
      })}
      {anomalyList.length === 0 && (
        <div className="text-slate-500 text-sm text-center py-8">No active anomalies</div>
      )}
    </>
  );

  return (
    <div className="h-[calc(100vh-52px)] sm:h-[calc(100vh-56px)] flex flex-col sm:flex-row relative">
      {/* 3D Canvas — full width on mobile, flex-1 on desktop */}
      <div className="flex-1 relative min-h-0">
        {devices.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/80">
            <div className="text-slate-400 text-lg">Loading 3D building...</div>
          </div>
        )}
        <Canvas
          camera={{ position: [60, 40, 60], fov: 50 }}
          onPointerMissed={handlePointerMissed}
        >
          <Scene
            devices={devices}
            anomalyMap={anomalyMap}
            selectedDeviceId={selectedDeviceId}
            hoveredDevice={hoveredDevice}
            flyToTarget={flyToTarget}
            onSelectDevice={setSelectedDeviceId}
            onHoverDevice={setHoveredDevice}
            onUnhoverDevice={handleUnhover}
          />
        </Canvas>
      </div>

      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden sm:block w-72 bg-slate-800 border-l border-slate-700 overflow-y-auto p-4">
        <h2 className="text-white font-bold text-lg mb-1">Anomalies</h2>
        <p className="text-slate-400 text-sm mb-4">
          {anomalyList.length} active anomal{anomalyList.length === 1 ? 'y' : 'ies'}
        </p>
        <div className="space-y-2">{anomalyListContent}</div>
      </div>

      {/* Mobile bottom panel */}
      <div
        className={`sm:hidden fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 rounded-t-2xl transition-transform duration-300 ease-out z-20 ${
          panelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-3.5rem)]'
        }`}
        style={{ height: '60vh' }}
      >
        {/* Drag handle + header */}
        <button
          className="w-full flex flex-col items-center pt-2 pb-3 px-4"
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <div className="w-10 h-1 rounded-full bg-slate-600 mb-2" />
          <div className="flex items-center justify-between w-full">
            <span className="text-white font-bold text-sm">
              Anomalies
              <span className="ml-2 text-xs font-normal text-amber-400">
                {anomalyList.length} active
              </span>
            </span>
            <span className="text-slate-400 text-xs">{panelOpen ? '▼ Close' : '▲ Open'}</span>
          </div>
        </button>
        {/* Scrollable list */}
        <div className="overflow-y-auto px-4 pb-6 space-y-2" style={{ height: 'calc(60vh - 3.5rem)' }}>
          {anomalyListContent}
        </div>
      </div>
    </div>
  );
}

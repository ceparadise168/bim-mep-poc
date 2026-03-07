const BASE_URL = '/api/v1';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getDevices: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ devices: Device[]; total: number }>(`/devices${qs}`);
  },
  getDevice: (id: string) => fetchJson<DeviceDetail>(`/devices/${id}`),
  getDeviceSignals: (id: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<Signal[]>(`/devices/${id}/signals${qs}`);
  },
  getDeviceMaintenance: (id: string) => fetchJson<Maintenance[]>(`/devices/${id}/maintenance`),
  getFloorOverview: (floor: number) => fetchJson<FloorOverview>(`/floors/${floor}/overview`),
  getBuildingDashboard: () => fetchJson<BuildingDashboard>('/building/dashboard'),
  getAnomalies: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<Anomaly[]>(`/anomalies${qs}`);
  },
  getChaosScenarios: () => fetchJson<ChaosScenario[]>('/chaos/scenarios'),
  triggerChaos: (scenario: string, devices: string[]) =>
    fetch(`${BASE_URL}/chaos/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, devices }),
    }).then(r => r.json()),
  getEnergyAnalytics: () => fetchJson<EnergyAnalytics>('/analytics/energy'),
  getComfortAnalytics: () => fetchJson<ComfortAnalytics>('/analytics/comfort'),
};

export interface Device {
  device_id: string;
  device_type: string;
  floor: number;
  zone: string;
  vendor_name: string;
  vendor_model: string;
}

export interface DeviceDetail extends Device {
  vendor_protocol: string;
  firmware_version: string;
  geometry: { position: { x: number; y: number; z: number }; dimensions: Record<string, number> };
  latestSignals: Signal[];
}

export interface Signal {
  time: string;
  metric_name: string;
  value: number;
  quality?: string;
}

export interface Maintenance {
  id: number;
  device_id: string;
  log_type: string;
  description: string;
  performed_at: string;
}

export interface FloorOverview {
  floor: number;
  deviceCount: number;
  devices: Device[];
  activeAnomalies: { severity: string; count: number }[];
}

export interface BuildingDashboard {
  totalDevices: number;
  devicesByType: { device_type: string; count: number }[];
  activeAnomalies: { severity: string; count: number }[];
  energyTrend: { hour: string; total_kwh: number }[];
}

export interface Anomaly {
  id: number;
  fingerprint: string;
  device_id: string;
  anomaly_type: string;
  severity: string;
  state: 'pending' | 'firing' | 'resolved';
  message: string;
  detected_at: string;
  fired_at?: string;
  resolved_at?: string;
  occurrence_count: number;
}

export interface ChaosScenario {
  name: string;
  description: string;
}

export interface EnergyAnalytics {
  floorEnergy: { floor: number; total_kwh: number }[];
  copTrend: { hour: string; avg_cop: number }[];
}

export interface ComfortAnalytics {
  floorComfort: { floor: number; avg_temp: number; avg_humidity: number; avg_co2: number }[];
}

export function connectWebSocket(onMessage: (data: { channel: string; data: unknown }) => void) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  const subscriptions = new Set<string>();

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch { /* ignore */ }
  };

  ws.onopen = () => {
    for (const channel of subscriptions) {
      ws.send(JSON.stringify({ action: 'subscribe', channel }));
    }
  };

  return {
    subscribe: (channel: string) => {
      subscriptions.add(channel);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'subscribe', channel }));
      }
    },
    unsubscribe: (channel: string) => {
      subscriptions.delete(channel);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', channel }));
      }
    },
    close: () => ws.close(),
    ws,
  };
}

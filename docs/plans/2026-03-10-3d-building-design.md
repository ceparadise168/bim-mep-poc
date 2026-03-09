# 3D Building Real-Time Anomaly Visualization

## Summary

New `/3d` page with a transparent glass-floor 3D building model showing 474 devices as colored spheres. Anomalous devices emit earthquake-style pulse rings. Click any device for a tooltip with ID, type, floor, zone, and latest metrics. Real-time updates via WebSocket.

## Tech Stack

- React Three Fiber (`@react-three/fiber` ^8.15)
- drei helpers (`@react-three/drei` ^9.88)
- Three.js (`three` ^0.160)

## Architecture

```
/3d page (Building3DView.tsx)
├── R3F Canvas
│   ├── BuildingModel — 13 transparent floor plates (B1 + 1-12F)
│   ├── DevicePoints — 474 spheres colored by status
│   ├── AnomalyPulses — expanding ring animations on anomalous devices
│   ├── DeviceTooltip — drei Html component with Tailwind card
│   ├── OrbitControls — rotate/zoom/pan
│   └── Lighting + Environment
└── SidePanel — live anomaly list (right side)
```

## Data Flow

1. `GET /api/v1/devices` — load all device positions + types on mount
2. WebSocket `anomalies` channel — real-time anomaly state updates
3. React state (`devices` + `anomalyMap`) drives R3F scene re-renders

## Visual Spec

| Element | Appearance |
|---------|------------|
| Floor plate | 40m x 30m, opacity 0.08, cyan edge wireframe, 4.2m spacing |
| Normal device | Gray-green sphere (r=0.3), static |
| Warning device | Amber sphere + amber pulse ring expanding to 3m |
| Critical device | Red sphere + red pulse ring expanding to 5m, faster |
| Pending device | Yellow sphere + slow pulse |
| Tooltip | Tailwind dark card: device ID, type, floor, zone, latest metrics |

## Pulse Animation

- RingGeometry expanding from 0 to max radius
- Opacity fades 0.6 → 0 during expansion
- Continuous loop via useFrame
- Critical: faster cycle, larger radius

## Interaction

- OrbitControls: drag rotate, scroll zoom
- Click device sphere: show tooltip
- Click empty space: dismiss tooltip
- Hover device: pointer cursor
- Tooltip has link to `/device/:id` for full detail

## Out of Scope

- Real BIM/IFC model loading
- Floor explode/expand animation
- 3D device models (all spheres)
- In-tooltip signal history charts

## Files to Create/Modify

- `packages/dashboard/package.json` — add three, R3F, drei
- `packages/dashboard/src/pages/Building3DView.tsx` — main page
- `packages/dashboard/src/components/3d/BuildingModel.tsx` — floor plates
- `packages/dashboard/src/components/3d/DevicePoints.tsx` — device spheres
- `packages/dashboard/src/components/3d/AnomalyPulses.tsx` — pulse rings
- `packages/dashboard/src/components/3d/DeviceTooltip.tsx` — click tooltip
- `packages/dashboard/src/App.tsx` — add /3d route

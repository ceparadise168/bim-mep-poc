# BIM MEP IoT Backend POC

Smart Hospital Building MEP (Mechanical, Electrical, Plumbing) Equipment Management Platform - Backend POC with real-time IoT signal simulation, anomaly detection, and visualization dashboard.

## Architecture

```mermaid
graph TB
    subgraph Simulation
        SIM[Signal Simulator<br/>474 devices, 12 types]
    end

    subgraph Ingestion
        GW[Ingestion Gateway<br/>HTTP / WebSocket / MQTT]
        DLQ[Dead Letter Queue]
    end

    subgraph Messaging
        RS[Redis Streams<br/>Consumer Groups]
    end

    subgraph Processing
        SP[Stream Processor<br/>Aggregation + Derived Metrics]
        AE[Anomaly Engine<br/>6 anomaly types]
        CE[Chaos Engine<br/>5 fault scenarios]
    end

    subgraph Storage
        TS[(TimescaleDB<br/>Raw + Aggregated)]
    end

    subgraph API Layer
        API[Fastify REST API<br/>+ WebSocket]
        SW[Swagger/OpenAPI<br/>Auto-generated]
    end

    subgraph Frontend
        DB[React Dashboard<br/>Recharts + Tailwind]
    end

    SIM --> GW
    GW -->|Valid| RS
    GW -->|Invalid| DLQ
    RS --> SP
    SP --> TS
    SP --> AE
    CE --> SIM
    API --> TS
    API --> RS
    API --> CE
    DB --> API
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (Node.js) |
| Signal Queue | Redis Streams |
| Time-series DB | TimescaleDB (PostgreSQL) |
| Real-time Push | WebSocket |
| API | Fastify + OpenAPI |
| Dashboard | React + Recharts + Tailwind |
| Containers | Docker Compose |

## Quick Start

### Docker (Recommended)

```bash
docker-compose up
```

Services:
- Dashboard: http://localhost:5173
- API Server: http://localhost:3000
- Swagger Docs: http://localhost:3000/docs
- Ingestion Gateway: http://localhost:3100

### Local Development

```bash
# Prerequisites: Node.js 20+, Redis, PostgreSQL/TimescaleDB

npm install

# Initialize database
node --loader tsx packages/stream-processor/src/init-db.ts

# Run tests
npm test

# Start services (each in separate terminal)
node --loader tsx packages/signal-simulator/src/standalone.ts
node --loader tsx packages/ingestion-gateway/src/standalone.ts
node --loader tsx packages/stream-processor/src/standalone.ts
node --loader tsx packages/api-server/src/standalone.ts
cd packages/dashboard && npm run dev
```

## Project Structure

```
bim-mep-poc/
├── packages/
│   ├── signal-simulator/    # 474 IoT device simulators
│   ├── ingestion-gateway/   # HTTP/WS/MQTT signal receiver
│   ├── stream-processor/    # Redis consumer + TimescaleDB writer
│   ├── anomaly-engine/      # Anomaly detection + chaos injection
│   ├── api-server/          # REST + WebSocket API
│   └── dashboard/           # React visualization
├── docker-compose.yml       # One-click deployment
├── Dockerfile.app           # Backend services
└── Dockerfile.dashboard     # Frontend (nginx)
```

## Simulated Devices (474 total)

| Type | Count | Interval | Protocols |
|------|-------|----------|-----------|
| Chiller | 4 | 1s | BACnet IP |
| AHU | 24 | 2s | BACnet/Modbus/OPC UA |
| VFD | 48 | 1s | Modbus TCP |
| Power Panel | 12 | 5s | Modbus/OPC UA |
| UPS | 4 | 3s | Modbus/REST |
| Generator | 2 | 5s | Modbus TCP |
| Fire Pump | 6 | 10s | Modbus/MQTT |
| Elevator | 8 | 1s | OPC UA |
| Lighting Controller | 120 | 30s | BACnet/MQTT |
| Temp/Humidity Sensor | 200 | 10s | BACnet/Modbus/MQTT |
| Water Meter | 16 | 15s | MQTT/Modbus |
| Air Quality Sensor | 30 | 10s | MQTT/REST |

## API Endpoints

### REST

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/devices | Device list (filter, paginate) |
| GET | /api/v1/devices/:id | Device detail + latest readings |
| GET | /api/v1/devices/:id/signals | Signal history (time range, downsample) |
| GET | /api/v1/devices/:id/maintenance | Maintenance records |
| GET | /api/v1/floors/:floor/overview | Floor summary |
| GET | /api/v1/building/dashboard | Building dashboard data |
| GET | /api/v1/anomalies | Anomaly events |
| POST | /api/v1/chaos/trigger | Trigger fault injection |
| GET | /api/v1/chaos/scenarios | Available chaos scenarios |
| GET | /api/v1/analytics/energy | Energy analytics |
| GET | /api/v1/analytics/comfort | Comfort analytics |

### WebSocket

```
ws://host/ws
  subscribe: "signals:{deviceId}"     # Single device signals
  subscribe: "signals:floor:{n}"      # Floor signals
  subscribe: "anomalies"              # Real-time alerts
  subscribe: "dashboard"              # Dashboard updates
```

## Chaos Scenarios

1. **Chiller Failure** - Compressor current spike + AHU temperature cascade
2. **Power Anomaly** - Voltage drop + UPS switch + generator startup
3. **Sensor Drift** - Gradual temperature/humidity deviation
4. **Network Outage** - Entire floor devices go offline
5. **Water Leak** - Pressure drop + fire pump activation

## Tests

```bash
npm test  # 122 tests across all packages
```

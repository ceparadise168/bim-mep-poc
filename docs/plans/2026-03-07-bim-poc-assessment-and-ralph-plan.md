# BIM MEP POC Assessment and Hardening Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將目前的 `bim-mep-poc` 從「模組齊全但整合鬆散的展示骨架」提升為「可在合作會議中可信展示的醫療大樓 BIM/IoT 後端 POC」，重點證明端到端資料流、異常偵測、即時視覺化，以及未來與 Unity / Unreal 對接的可行性。

**Architecture:** 保留 TypeScript monorepo、Redis Streams、TimescaleDB、Fastify 與 React 這組務實的 POC 技術棧，但把資料路徑收斂成單一路徑：`Simulator / Protocol Adapter -> Ingestion Gateway -> Stream Processor -> Anomaly Engine -> Read API / WebSocket -> Dashboard / Unity / Unreal`。設備主檔、BIM 幾何映射、異常事件與即時推播都必須變成實際運行能力，而不是只存在於 README、測試或記憶體中。

**Tech Stack:** TypeScript, Node.js, Fastify, Redis Streams, TimescaleDB/PostgreSQL, React, Docker Compose

## 問題框定

### 功能需求
- 模擬大型醫療建築的機電設備與 IoT 訊號，含多廠商、多協定、不同訊號頻率。
- 建立可靠的後端整合架構，接收、驗證、正規化、儲存與聚合訊號。
- 產生異常、警告、連鎖故障與隨機中斷，並可由 API 觸發。
- 提供即時視覺化畫面與分析數據，供 Web dashboard 與後續 Unity / Unreal 使用。
- 讓使用者點選設備時可取得 BIM 相關幾何資訊與設備主檔資訊。

### 非功能需求
- POC 需要在兩天內完成，重點是「端到端可信」而不是「功能面面俱到」。
- 現場 demo 必須能用 `docker-compose up` 或等價指令穩定啟動。
- 架構說法要經得起工程追問，不能把未串接的模組說成已完成能力。
- 後端需為後續 Unity / Unreal 團隊保留穩定的讀模型與事件介面。

### 我採用的假設
- 這次會議的目標是展示後端架構能力與合作可行性，不是直接上線商用。
- 可以接受 POC 階段使用 Redis Streams 與 Docker Compose，不必急著拆成微服務或引入 Kafka。
- 現階段不需要做完整 auth / RBAC / CMMS，只需要把資料與事件主路徑做實。

## 結論摘要

目前專案方向是對的，整體我會給「概念方向 8/10，工程可信度 5/10」。

它已經具備一個很好的 POC 骨架：模組邊界清楚、設備 metadata 有 BIM 感、TimescaleDB 與 Redis Streams 的選型務實，Dashboard 也足以支撐商務 demo。這些都很適合你用來跟未來的 Unity / Unreal 工程師討論責任分工。

但如果用真實世界工程實踐來看，現在最大的問題不是「少了某個功能」，而是「幾個最重要的價值主張還沒有真正串起來」。目前 repo 比較像是多個能力元件並排存在，而不是一套從裝置訊號到異常事件再到即時畫面的可信運行系統。

建議你在對外溝通時，把目前版本定位成：

- 一個完成 60% 到 70% 的後端 POC 骨架
- 已證明資料模型、模擬器、儀表板與核心服務切分方向正確
- 接下來兩天應優先補齊端到端誠實性，而不是再擴大功能範圍

## 風險優先評估

### P1. 模擬器繞過 ingestion gateway，核心價值主張與實際運行路徑不一致

**證據**
- `packages/signal-simulator/src/standalone.ts:4-12` 直接把訊號寫進 Redis Stream。
- `docker-compose.yml:41-65` 同時啟動 `signal-simulator` 與 `ingestion-gateway`，但兩者沒有形成實際依賴路徑。
- `packages/ingestion-gateway/src/gateway-server.ts:37-141` 的驗證、DLQ、WebSocket ingest 都只存在於 gateway 本身，並不在 compose 的主要熱路徑中。

**影響**
- 無法誠實證明「多協定設備統一接入、驗證、正規化、背壓、DLQ」這個後端能力。
- 對合作方而言，這會讓系統看起來像「有很多模組」，但沒有真正展示整合能力。

**建議**
- 將 simulator 改為只呼叫 gateway 的 HTTP / WS / MQTT 入口，不可直接寫 Redis。
- 保留 Redis 只作為 gateway 之後的內部訊息匯流排。

### P1. 異常偵測、故障注入與 API / DB 沒有串成同一條生產路徑

**證據**
- `packages/api-server/src/api-server.ts:23-31` 的 chaos scenario / history 存在 API process 記憶體內。
- `packages/api-server/src/api-server.ts:175-203` 觸發 chaos 時只寫入記憶體並廣播一個 WebSocket 訊息。
- `packages/anomaly-engine/src/anomaly-detector.ts:13-260` 與 `packages/anomaly-engine/src/chaos-engine.ts:86-217` 都是獨立 library，沒有被 `stream-processor` 或 `api-server` 真正接上。
- `packages/api-server/src/data-store.ts:122-186` 會查 `anomaly_events`，但 repo 內沒有實際寫入 `anomaly_events` 的運行程式。
- `tests/integration/e2e.test.ts:74-110` 只是在測試裡各自 new `AnomalyDetector` / `ChaosEngine`，不是真正驗證線上資料流。

**影響**
- 現在的「異常中心」比較像靜態查詢頁面加手動提示，而不是真正的故障注入與異常監控系統。
- 這直接削弱了你要展示的核心價值：可靠後端如何把異常從原始訊號一路反映到視覺化界面。

**建議**
- 把 `ChaosEngine` 接進 signal generation / processing path。
- 把 `AnomalyDetector` 接進 stream processor 或獨立 worker，並將結果寫入 `anomaly_events`。
- WebSocket 推播應來自已落庫或已確認的事件，而不是純 UI 通知。

### P1. `docker-compose up` 不會自動建立設備主檔，導致裝置查詢與 dashboard 很可能是空的

**證據**
- `packages/stream-processor/src/init-db.ts:6-31` 只做 schema / hypertable / retention 初始化。
- `scripts/register-devices.ts:7-29` 才會把 474 台設備寫入 `devices` 表。
- `docker-compose.yml:30-107` 沒有任何 service 會呼叫 `scripts/register-devices.ts`。
- `packages/api-server/src/data-store.ts:27-57`、`137-157`、`189-218` 多個 API 都依賴 `devices` 表。

**影響**
- `GET /api/v1/devices`、樓層頁、設備頁、能源分析都有機會在 demo 當下顯示空資料或部分資料。
- 這會讓外部觀眾對「BIM 設備主檔 + IoT 訊號整合」的印象直接打折。

**建議**
- 在 compose bootstrap 加入 seed service，保證一鍵啟動後 DB 內一定有設備主檔。
- 讓 README 的 quick start 反映真實啟動步驟，避免文件與實際行為不一致。

### P2. Dashboard 名義上支援 WebSocket，但實際是輪詢，且部分頁面資料契約不完整

**證據**
- `packages/dashboard/src/pages/BuildingOverview.tsx:13-20`、`FloorDetail.tsx:11-18`、`AnomalyCenter.tsx:17-24` 以 `setInterval` 輪詢 API。
- `packages/dashboard/src/api.ts:106-131` 有 `connectWebSocket()`，但 repo 中沒有任何頁面使用它。
- `packages/api-server/src/api-server.ts:216-237` 雖然有 `/ws`，但實際程式只在 `anomalies` channel 上廣播。
- `packages/api-server/src/data-store.ts:117-120` 的樓層查詢沒帶 `vendor_name`，但 `packages/dashboard/src/pages/FloorDetail.tsx:68-82` 會顯示 vendor 欄位。

**影響**
- 現在的「即時」實際上是 5 秒輪詢；這對醫療建築監控與未來 Unity / Unreal 場景同步來說說服力不夠。
- UI 已經暴露了讀模型不完整的問題，代表 API schema 還沒有定穩。

**建議**
- 至少把 `anomalies`、`signals:{deviceId}`、`signals:floor:{n}`、`dashboard` 做成真實 WebSocket feed。
- 為 Dashboard 與 Unity / Unreal 建立明確的 read model，不要直接拼湊資料表查詢結果。

### P2. 專案對外宣稱「全部完成 / 全部測試通過」，但目前驗證方式不夠誠實

**證據**
- `PROGRESS.md:3-67` 宣稱所有 phase 完成且 `129 tests` 全部通過。
- `README.md:170-174` 直接宣稱 `npm test` 是穩定可跑的驗證方式。
- 我在 2026-03-07 實際執行 `npm test` 時，`@bim-mep/api-server`、`@bim-mep/ingestion-gateway`、`@bim-mep/stream-processor` 失敗，原因包含測試依賴 listen socket / 本機 Redis，且不是 hermetic。

**影響**
- 這不是功能問題，而是「工程可信度」問題。
- 若你下週要與對方討論後端 ownership，對方很可能會問：「你怎麼證明這套 POC 可重複啟動與驗證？」目前這個答案還不夠強。

**建議**
- 將測試分成 pure unit、container integration、demo smoke 三層。
- 不要再用「全部完成」描述目前狀態；改成「核心骨架完成，現在進行端到端收斂」。

### P2. MQTT 與背壓能力存在於程式碼中，但尚未成為可運行的 demo 能力

**證據**
- `packages/ingestion-gateway/src/mqtt-broker.ts:12-69` 有 MQTT broker 實作。
- `packages/ingestion-gateway/src/standalone.ts:1-13` 啟動時只啟動 Fastify gateway，沒有啟動 MQTT broker。
- `docker-compose.yml:54-65` 也沒有暴露 `1883` port。
- `packages/ingestion-gateway/src/redis-publisher.ts:48-70` 的 `publishBatch()` 沒有實際檢查 stream 長度，batch path 的背壓保護並不完整。

**影響**
- 如果你要對外說「支援多協定、多接入方式」，現在比較像 roadmap，不是現場可驗證能力。

**建議**
- 若兩天內要 demo，至少讓 MQTT 真正可用，或在文件中誠實標記為 next step。
- 背壓應以 queue depth 與 response behavior 做真實驗證，不應只靠程式內 flag。

## 專案的優點

雖然上面列了不少風險，但這個 repo 其實有幾個很值得保留的優點：

- **架構邊界清楚**：`signal-simulator`、`ingestion-gateway`、`stream-processor`、`anomaly-engine`、`api-server`、`dashboard` 這個切法對 POC 很合適。
- **技術選型務實**：對兩天 POC 來說，Redis Streams + TimescaleDB 比 Kafka + ClickHouse 更適合，也更容易 demo。
- **設備 metadata 有 BIM 潛力**：vendor、geometry、`bimModelRef` 都已經有基本雛形，可延伸成 digital twin。
- **異常情境設計貼近醫療建築場景**：空調、電力、網路、漏水等情境很適合做現場展示。
- **Dashboard 足以作為商務輔助畫面**：畫面不華麗，但足夠支撐架構說明與異常演示。

## 建議的對外定位

下週與合作方見面時，我建議你把這個 repo 定位成：

- 後端架構 POC，而不是 finished product
- 已證明資料模型、訊號模擬、時序儲存、查詢層與 UI 骨架可行
- 正在補齊端到端整合與 demo-runbook，下一步是對接 Unity / Unreal 與真實 BIM asset model

這樣說法最誠實，也最符合資深後端工程師的敘事方式。

## 兩天內應該優先做到的目標

### Must Have
- `docker-compose up` 後，Dashboard 與 API 立即可見 474 台設備與非空資料。
- 所有模擬訊號都走 gateway，而不是直接打 Redis。
- 透過 API 觸發 fault injection，3 秒內可在 DB 與 Dashboard 看見 anomaly event。
- 至少一個 device 頁面與一個 floor 頁面能看到真實即時更新，而不是只有輪詢。
- 有一套可重複執行的 smoke test / demo script。

### Nice To Have
- MQTT 真正接起來。
- 補 `maintenance_logs` seed data。
- 為 Unity / Unreal 準備一份 read model contract。

### 這兩天不該擴大的範圍
- 不要急著拆 microservices。
- 不要導入 Kafka / Kubernetes。
- 不要做完整 RBAC / auth。
- 不要做真的 IFC parser；先把 `bimModelRef + geometry + asset metadata` 穩住就夠。

## Ralph 可執行的目標與驗收策略

### Completion Promise

當且僅當以下條件全部成立時，Ralph 才能輸出 `<promise>BIM_POC_DEMO_READY</promise>`：

1. `docker-compose up -d` 後 3 分鐘內，`/api/v1/devices` 可查到 474 台設備。
2. Simulator 不再直接寫 Redis，所有模擬訊號都經過 ingestion gateway。
3. 透過 API 觸發 chaos 後，`anomaly_events` 在 3 秒內新增事件，Dashboard 可在 1 秒內收到更新。
4. Dashboard 至少有 `anomalies` 與 `signals:{deviceId}` 兩個真實 WebSocket 訂閱案例。
5. `README.md` 的啟動方式與實際啟動流程一致。
6. 有一個可重複執行的 smoke test 或 demo checklist，能證明端到端資料路徑成立。

### Task 1: 建立 demo-safe bootstrap

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `packages/stream-processor/src/init-db.ts`
- Modify or Create: `scripts/register-devices.ts`

**Goal**
- 一鍵啟動後，資料庫一定有 schema、474 台設備主檔，以及足夠支撐 Dashboard 的初始資料。

**Acceptance**
- Run: `docker-compose up -d`
- Run: `curl http://localhost:3000/api/v1/devices?limit=1`
- Expected: `total` 為 `474`，且第一筆設備包含 `vendor_name`、`vendor_protocol`、`geometry`

### Task 2: 收斂單一 ingestion path

**Files:**
- Modify: `packages/signal-simulator/src/standalone.ts`
- Modify: `packages/ingestion-gateway/src/standalone.ts`
- Modify: `packages/ingestion-gateway/src/gateway-server.ts`
- Modify: `packages/ingestion-gateway/src/redis-publisher.ts`
- Modify: `docker-compose.yml`

**Goal**
- Simulator 只能透過 gateway 送資料；gateway 需要成為 HTTP / WS / MQTT 的唯一入口。

**Acceptance**
- Run: `curl http://localhost:3100/api/v1/stats`
- Expected: `httpReceived` 或 `wsReceived` 會持續增加
- Run: `redis-cli XLEN signals:raw`
- Expected: stream length 增加，但來源必須可從 gateway stats 反映
- Run: `nc -vz localhost 1883`
- Expected: MQTT broker 可連線，或 README 明確註明不在本次 demo 範圍

### Task 3: 把 anomaly 與 chaos 接進真正的資料流

**Files:**
- Modify: `packages/stream-processor/src/processor.ts`
- Modify: `packages/stream-processor/src/db-writer.ts`
- Modify: `packages/anomaly-engine/src/anomaly-detector.ts`
- Modify: `packages/anomaly-engine/src/chaos-engine.ts`
- Modify: `packages/api-server/src/api-server.ts`
- Modify: `packages/api-server/src/data-store.ts`

**Goal**
- 故障注入會改變訊號，異常偵測會落庫，API / Dashboard 看到的是同一份事件事實。

**Acceptance**
- Run: `curl -X POST http://localhost:3000/api/v1/chaos/trigger -H 'Content-Type: application/json' -d '{"scenario":"空調主機故障","devices":["CH-00F-001"]}'`
- Run within 3s: `curl http://localhost:3000/api/v1/anomalies?limit=5`
- Expected: 回傳資料中包含新事件，且 `device_id = CH-00F-001` 或其 cascade 影響設備

### Task 4: 建立真正的即時 read model

**Files:**
- Modify: `packages/api-server/src/api-server.ts`
- Modify: `packages/api-server/src/ws-manager.ts`
- Modify: `packages/dashboard/src/api.ts`
- Modify: `packages/dashboard/src/pages/BuildingOverview.tsx`
- Modify: `packages/dashboard/src/pages/AnomalyCenter.tsx`
- Modify: `packages/dashboard/src/pages/DeviceDetail.tsx`
- Modify: `packages/dashboard/src/pages/FloorDetail.tsx`

**Goal**
- Dashboard 不再只靠輪詢；至少兩個核心畫面改為真正的 WebSocket push。

**Acceptance**
- Open dashboard 並訂閱 `anomalies`
- Trigger chaos
- Expected: 1 秒內畫面新增異常項目，無需等待 5 秒 polling
- Subscribe: `signals:{deviceId}`
- Expected: 單設備折線圖會持續收到新點位

### Task 5: 建立可重複驗證的工程證據

**Files:**
- Modify: `tests/integration/e2e.test.ts`
- Modify: `packages/api-server/tests/api-server.test.ts`
- Modify: `packages/ingestion-gateway/tests/gateway-server.test.ts`
- Modify: `packages/stream-processor/tests/stream-consumer.test.ts`
- Create: `scripts/demo-smoke.ts` or `scripts/demo-smoke.sh`
- Modify: `PROGRESS.md`

**Goal**
- 測試要誠實反映依賴條件，並與 demo 驗證腳本分層。

**Acceptance**
- Run: `npm test`
- Expected: pure unit 測試全部通過；依賴 Redis / DB / listen socket 的測試要明確在 integration profile 中跑
- Run: `node scripts/demo-smoke.ts`
- Expected: 輸出 `BOOTSTRAP_OK`、`INGEST_OK`、`ANOMALY_OK`、`WS_OK`

### Task 6: 為 Unity / Unreal 定義穩定對接契約

**Files:**
- Modify: `README.md`
- Create: `docs/contracts/unity-unreal-read-model.md`
- Modify: `packages/api-server/src/api-server.ts`
- Modify: `packages/dashboard/src/api.ts`

**Goal**
- 讓前端引擎工程師知道哪些資料應透過 REST 初始載入、哪些透過 WebSocket 增量同步。

**Acceptance**
- 文件中至少定義以下 payload：
- `BuildingSnapshot`
- `FloorSnapshot`
- `DeviceTwin`
- `SignalDelta`
- `AnomalyEvent`
- `ChaosTriggerResult`

## 建議的 Ralph Prompt 方向

若你要把這份報告交給 Ralph 使用，核心任務敘述應改成：

```markdown
任務：將目前的 bim-mep-poc 收斂成一個 demo-safe、端到端可信的醫療大樓 BIM/IoT 後端 POC。

限制：
- 不新增新的大型基礎設施；保留 TypeScript monorepo、Redis Streams、TimescaleDB、Docker Compose。
- 優先修正資料路徑與驗證誠實性，不擴大功能面。
- 所有模擬訊號必須經過 ingestion gateway。
- anomaly 與 chaos 必須寫入資料庫並可由 API / Dashboard 查詢與即時接收。
- dashboard 至少兩個核心畫面改用 WebSocket。
- docker-compose up 後，不需人工補資料即可 demo。

完成定義：
- /api/v1/devices 可查到 474 台設備
- /api/v1/anomalies 可在 chaos 觸發後 3 秒內看到新事件
- dashboard 可在 1 秒內顯示 anomaly 更新
- README、PROGRESS、測試結果與實際狀態一致
- 輸出 <promise>BIM_POC_DEMO_READY</promise>
```

## 最後建議

如果你的目標是下週會議「講得穩、demo 不翻車」，優先順序應該是：

1. 讓 demo 跑得出來
2. 讓資料路徑說得通
3. 讓異常真的會出現
4. 讓 UI 看起來是 live 的
5. 最後才是補更多頁面或更多 fancy 指標

對這種機會來說，工程價值不在於你塞了多少 feature，而在於你能不能把「資料怎麼進來、怎麼被判斷、怎麼被展示、未來怎麼跟 3D 引擎對接」講成一條一致而可信的故事。

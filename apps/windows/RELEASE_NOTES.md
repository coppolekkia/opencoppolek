# Windows Companion App – Release Notes

## Branch
`windows_companion_app`

## Scope
Initial Windows companion node foundation with full **Core** layer (Phase 1) parity for protocol/method handling, connection resilience, and test coverage.

---

## Highlights

### 1) Project Foundation
- Added `apps/windows/OpenClaw.sln`
- Added runtime project: `OpenClaw.Node`
- Added test project: `OpenClaw.Node.Tests`
- Added workspace docs:
  - `PLAN.md`
  - `HANDOFF.md`

### 2) Gateway Protocol + Connection
- Implemented protocol frame models for gateway communication (`req` / `res` / `event`)
- Implemented connect flow:
  - receive `connect.challenge`
  - send `connect` request
  - handle `hello-ok`
- Implemented reconnection resilience:
  - exponential backoff (up to 30s)
  - tick monitor with reconnect on missed tick

### 3) Core Method Coverage (Phase 1 complete)
Implemented handlers for:
- `status`
- `health`
- `set-heartbeats`
- `system-event`
- `channels.status`
- `config.get`
- `config.set`
- `config.patch`
- `config.schema`
- `node.pair.list`
- `node.pair.approve`
- `node.pair.reject`
- `device.pair.list`
- `device.pair.approve`
- `device.pair.reject`

### 4) Pairing Event Handling
- Added event ingestion for pairing lifecycle:
  - `device.pair.requested`
  - `node.pair.requested`
  - `device.pair.resolved`
  - `node.pair.resolved`
- Maintains in-memory pending pairing cache (add/list/remove by kind)

### 5) Node Invoke Command Path
- Implemented `node.invoke.request` handling + `node.invoke.result` responses
- Added command executor support for:
  - `system.run`
  - `system.which`
  - `system.notify`

### 6) Runtime Config Resolution
- Gateway URL/token resolution order:
  1. CLI args (`--gateway-url`, `--gateway-token`)
  2. env (`OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`)
  3. `~/.openclaw/openclaw.json`

### 7) Naming Refactor
- Refactored `Phase1*` naming to `Core*` (e.g., `CoreMethodService`)
- Established naming direction:
  - **Core** for foundation/protocol layer
  - **Api** for next capability layer

### 8) Test Coverage
- Current suite: **25 passing tests**
- Coverage includes:
  - protocol model serialization/deserialization
  - dispatch success + error paths
  - pairing validation and event ingestion behavior
  - mocked WebSocket gateway roundtrip
  - opt-in real gateway integration tests (`RUN_REAL_GATEWAY_INTEGRATION=1`):
    - hello-ok connect
    - status command response

---

## Build/Test Commands
```bash
cd apps/windows
dotnet build
dotnet test
```

Real gateway integration tests (opt-in):
```bash
cd apps/windows
RUN_REAL_GATEWAY_INTEGRATION=1 dotnet test --filter "FullyQualifiedName~RealGatewayIntegrationTests"
```

---

## Notes
- Build artifacts are excluded via `apps/windows/.gitignore` (`**/bin/`, `**/obj/`).
- Pairing cache is currently in-memory only (not persisted).
- Next planned work starts in **Api** layer (Phase 2 capabilities).

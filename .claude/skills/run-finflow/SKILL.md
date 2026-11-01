---
name: run-finflow
description: Run FinFlow locally — web dev server on localhost:5173 against the PRODUCTION API over an SSH tunnel. Use when asked to start/run the app, the web, or the frontend, to open FinFlow, to check a change in the UI, or to screenshot the app.
---

# Running FinFlow

There is exactly one working setup: **the web runs locally, the API and database live on the
server** (Reg.cloud, 194.226.115.219). A local api+postgres pair also exists, but it is a
frozen copy from the migration — do not start it for normal work (see Pitfalls).

## Step 1. Tunnel to the production API (port 3000)

The API is not exposed publicly, only on the server's loopback. The forward is owned by the
`FinFlowTunnel` scheduled task (trigger: Windows logon, script
`C:\Users\Владислав\finflow-tunnel.ps1`, an infinite `ssh -N -L` loop that reconnects).

Check it, and start it if needed:

```powershell
if ((Get-ScheduledTask -TaskName FinFlowTunnel).State -ne 'Running') { Start-ScheduledTask -TaskName FinFlowTunnel }
Start-Sleep -Seconds 6
(Invoke-WebRequest -Uri 'http://127.0.0.1:3000/accounts' -TimeoutSec 5 -UseBasicParsing).StatusCode
```

Expect `200`. State `Ready` instead of `Running` is normal after a reboot where the task did
not fire on logon — just start it.

If `200` never arrives, the tunnel is not up: try `ssh root@194.226.115.219` by hand and
check that the `finflow-api` container is alive on the server.

## Step 2. Web

```
preview_start  name: "web"
```

Config lives in [.claude/launch.json](../../launch.json): `npm run dev` with `cwd: ./web`,
port 5173 (`strictPort`, host 127.0.0.1 — set deliberately in `web/vite.config.ts` because of
VPN DNS interception). Vite takes ~5 seconds to come up; a screenshot taken immediately after
start will be blank.

Without the preview tooling: `cd web && npm run dev`.

## Step 3. Confirm the app actually works

Open `http://localhost:5173/accounts` and look at the data: the page should show accounts in
three currencies (RUB, MNG, EUR), and the home page should show recent transactions. If the
Claude window is minimized, screenshots time out — fall back to `get_page_text`.

## Pitfalls

**Port 3000 is the tunnel, not a local backend.** Occupying it with the local API
(`npm run start:dev` in `api/`, or `preview_start name: "api-local-frozen-db"`) makes the
frontend silently run against the **frozen local database**: June 2026 data, two accounts
instead of seven. It looks like a perfectly working app — the only tell is the content. Kill
the tunnel deliberately before starting a local API, and restore it afterwards.

**The `finflow-postgres` container** may well be running — that is the local frozen copy. It
is wired to nothing and does not affect the app.

**Local Telegram bot.** `api/.env` holds a DEV bot token, so a local API (if you do start one)
will not fight the production bot over long polling. The production token exists only on the server.

## When you really do want the local stack

Rare: working offline, or testing a migration against throwaway data.

```bash
docker compose up postgres -d
cd api && npm run db:migrate && npm run start:dev
```

Stop the tunnel first (`Stop-ScheduledTask -TaskName FinFlowTunnel`, then kill `ssh.exe`),
otherwise port 3000 is taken. Restore the tunnel when you are done.

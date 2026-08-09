#!/usr/bin/env bash
#
# Start CallPal — both halves, supervised.
#
# The backend kept disappearing because `uvicorn --reload` is tied to the
# terminal that launched it. Close the tab, let the Mac sleep, or run a stray
# `kill`, and it is gone with nothing to bring it back. This script fixes that
# in three ways:
#
#   1. Clears anything already holding the ports, so "Address already in use"
#      cannot happen.
#   2. Runs the backend inside a restart loop, so a crash comes straight back
#      instead of leaving the app with nothing to talk to.
#   3. Shuts both halves down together on Ctrl-C, so there are no orphans left
#      behind to block the next run.
#
# Usage:
#   ./dev.sh            run in the foreground, logs on screen
#   ./dev.sh --detach   keep running after the terminal is closed

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$HERE/backend"
LOGS="$HERE/.logs"
mkdir -p "$LOGS"

API_PORT=8000
WEB_PORT=5173

say() { printf "\033[35m▍\033[0m %s\n" "$*"; }
warn() { printf "\033[33m▍\033[0m %s\n" "$*"; }

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)

  if [ -n "$pids" ]; then
    warn "port $port was in use — clearing it"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

if [ ! -d "$BACKEND/.venv" ]; then
  warn "No virtualenv at backend/.venv — create it first:"
  warn "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [ ! -f "$BACKEND/.env" ]; then
  warn "backend/.env is missing. Copy .env.example to .env and add your key."
fi

free_port "$API_PORT"
free_port "$WEB_PORT"

# --- backend, supervised ------------------------------------------------
run_api() {
  cd "$BACKEND" || exit 1
  # shellcheck disable=SC1091
  source .venv/bin/activate

  # `until` rather than a bare call: if uvicorn exits for any reason other
  # than us asking it to, start it again. A backend that heals itself beats a
  # backend that needs a human to notice it died.
  until uvicorn main:app --reload --port "$API_PORT"; do
    code=$?
    [ "$code" -eq 130 ] && break     # Ctrl-C
    warn "backend exited ($code) — restarting in 2s"
    sleep 2
  done
}

# --- frontend -----------------------------------------------------------
run_web() {
  cd "$HERE" || exit 1
  until npm run dev -- --port "$WEB_PORT"; do
    code=$?
    [ "$code" -eq 130 ] && break
    warn "frontend exited ($code) — restarting in 2s"
    sleep 2
  done
}

if [ "${1:-}" = "--detach" ]; then
  nohup bash -c "$(declare -f run_api warn); run_api" > "$LOGS/api.log" 2>&1 &
  nohup bash -c "$(declare -f run_web warn); run_web" > "$LOGS/web.log" 2>&1 &
  disown -a

  say "Running in the background. Closing this terminal will not stop it."
  say "  site      http://localhost:$WEB_PORT"
  say "  logs      tail -f $LOGS/api.log"
  say "  stop      ./dev.sh --stop"
  exit 0
fi

if [ "${1:-}" = "--stop" ]; then
  free_port "$API_PORT"
  free_port "$WEB_PORT"
  say "Stopped."
  exit 0
fi

trap 'echo; say "shutting down"; kill 0 2>/dev/null; exit 0' INT TERM

run_api & API_PID=$!
run_web & WEB_PID=$!

sleep 3
say "CallPal is starting"
say "  site  http://localhost:$WEB_PORT"
say "  api   http://127.0.0.1:$API_PORT/health"
say "  stop  Ctrl-C"

wait "$API_PID" "$WEB_PID"

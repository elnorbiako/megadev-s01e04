#!/usr/bin/env bash
# Save /digest/2026-10-28 as one self-contained HTML file: var/preview/index.html (ADR 0003).
#
# Usage: scripts/export-preview.sh [clean|marker]
#   clean   (default) LANE_MARKER is forced empty: the banner reads "no marker set".
#   marker  LANE_MARKER must be set in the environment. It is handed to the server and never printed.
#
# Env: PORT (default 8787). Nothing else from the caller's env reaches the server, except what
# .env supplies (node's --env-file never overrides a variable that is already set, so the
# explicit LANE_MARKER below wins over .env).
set -euo pipefail

mode="${1:-clean}"
case "$mode" in
  clean|marker) ;;
  *) echo "usage: $0 [clean|marker]" >&2; exit 2 ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

night="2026-10-28"
port="${PORT:-8787}"
base="http://127.0.0.1:${port}"
out_dir="var/preview"
out="${out_dir}/index.html"
server_log="var/preview-server.log" # outside out_dir: the artifact uploads out_dir only

if [[ "$mode" == "marker" ]]; then
  if [[ -z "${LANE_MARKER:-}" ]]; then
    echo "marker mode needs LANE_MARKER in the environment" >&2
    exit 1
  fi
  lane_marker="$LANE_MARKER"
else
  lane_marker=""
fi

mkdir -p "$out_dir" var
tmp=""
server_pid=""

cleanup() {
  if [[ -n "$tmp" ]]; then rm -f "$tmp"; fi
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if curl -s -o /dev/null --max-time 2 "$base/"; then
  echo "something already answers on port $port; stop it or set PORT" >&2
  exit 1
fi

# Exact PID of the tsx process; tsx forwards SIGTERM to its node child.
LANE_MARKER="$lane_marker" PORT="$port" \
  node_modules/.bin/tsx --env-file-if-exists=.env src/server.ts >"$server_log" 2>&1 &
server_pid=$!

tmp="$(mktemp "${out_dir}/.index.XXXXXX")"
ready=0
for _ in $(seq 1 30); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "server exited before serving; see $server_log" >&2
    exit 1
  fi
  if curl -fsS --max-time 5 -o "$tmp" "$base/digest/$night"; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "server not ready, or /digest/$night not served after 30s; nothing published" >&2
  exit 1
fi

# The page must be one static file (ADR 0001): no script, no external references.
if ! grep -qi '<html' "$tmp"; then
  echo "output is not an HTML page" >&2
  exit 1
fi
if grep -qi '<script' "$tmp"; then
  echo "output contains a script tag; ADR 0001 forbids client JS" >&2
  exit 1
fi
if grep -Eqi '(src|href)="https?://' "$tmp"; then
  echo "output references an external URL; the preview must be self-contained" >&2
  exit 1
fi

# Same directory, so the rename is atomic: the link never shows a half-written file.
mv -f "$tmp" "$out"
tmp=""
echo "wrote $out ($(wc -c <"$out" | tr -d ' ') bytes) · mode=$mode"

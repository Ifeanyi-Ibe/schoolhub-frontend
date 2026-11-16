#!/usr/bin/env bash
# Starts the SchoolHub backend for the real-backend suite (npm run test:real), in Development.
#
#   scripts/dev-backend.sh            run the API in the foreground
#   scripts/dev-backend.sh --seed     apply migrations and the idempotent demo seed first
#
# The backend directory is SCHOOLHUB_BACKEND_DIR (default ../School-Management). Its .env supplies the
# database connection. The BFF key is read from this repo's .env.e2e (E2E_BFF_KEY) and is never printed.
# E2E__RelaxLimits lifts the sign-in and API rate limits for local runs; the backend refuses it outside
# Development. The API address comes from E2E_API_BASE_URL.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
backend="${SCHOOLHUB_BACKEND_DIR:-$root/../School-Management}"
env_file="$root/.env.e2e"

[ -f "$env_file" ] || { echo "Missing $env_file. Copy .env.example's e2e section and fill it in." >&2; exit 1; }
[ -d "$backend/src/SchoolHub.Api" ] || { echo "Backend not found at $backend. Set SCHOOLHUB_BACKEND_DIR." >&2; exit 1; }

read_env() { grep -E "^$1=" "$env_file" | head -1 | cut -d= -f2-; }
api_url="$(read_env E2E_API_BASE_URL)"
bff_key="$(read_env E2E_BFF_KEY)"
[ -n "$api_url" ] && [ -n "$bff_key" ] || { echo "E2E_API_BASE_URL and E2E_BFF_KEY must be set in .env.e2e." >&2; exit 1; }
port="$(printf '%s' "$api_url" | sed -E 's#.*:([0-9]+).*#\1#')"

cd "$backend"
set -a
[ -f .env ] && . ./.env
set +a
export Bff__Keys__0="$bff_key"
export E2E__RelaxLimits=true
export ASPNETCORE_ENVIRONMENT=Development

if [ "${1:-}" = "--seed" ]; then
  dotnet tool restore >/dev/null
  dotnet ef database update -p src/SchoolHub.Infrastructure -s src/SchoolHub.Api
  dotnet run --no-launch-profile --project src/SchoolHub.Api -- seed-demo
fi

echo "Starting the SchoolHub API in Development on port $port (BFF key from .env.e2e, not printed)."
exec dotnet run --no-launch-profile --project src/SchoolHub.Api --urls "http://localhost:$port"

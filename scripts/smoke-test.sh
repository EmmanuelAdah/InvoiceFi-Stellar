#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# InvoiceFi-Stellar – Smoke Test Suite
#
# Runs against a deployed environment to verify basic functionality before
# traffic is cut over in a blue-green deployment.
#
# Usage:
#   scripts/smoke-test.sh --base-url https://staging.invoicefi.app [options]
#
# Options:
#   --base-url <URL>       Base URL of the deployment (required)
#   --horizon-url <URL>    Horizon RPC URL for Stellar checks
#   --timeout <seconds>    Max time per test (default: 60)
#   --verbose              Show detailed test output
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0
VERBOSE=false

# ── Parse arguments ──────────────────────────────────────────────────────────
BASE_URL=""
HORIZON_URL=""
TIMEOUT=60

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)    BASE_URL="$2";  shift 2 ;;
    --horizon-url) HORIZON_URL="$2"; shift 2 ;;
    --timeout)     TIMEOUT="$2";   shift 2 ;;
    --verbose)     VERBOSE=true;   shift ;;
    *) echo "::error::Unknown argument: $1"; exit 2 ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  echo "::error::--base-url is required"
  exit 2
fi

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

# ── Helpers ──────────────────────────────────────────────────────────────────
pass()     { echo "  ✅ $1"; }
fail()     { echo "  ❌ $1"; FAILED=$((FAILED + 1)); }
info()     { echo "  ℹ️ $1"; }
section()  { echo ""; echo "━━━ $1 ━━━"; }
header()   { echo ""; echo "═══════════════════════════════════════════════════"; echo " $1"; echo "═══════════════════════════════════════════════════"; }

http_check() {
  local desc="$1" url="$2" expected_code="${3:-200}"
  local code
  code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected_code" ]]; then
    pass "$desc (HTTP $code)"
    return 0
  else
    fail "$desc — expected $expected_code, got $code"
    return 1
  fi
}

json_field_check() {
  local desc="$1" url="$2" field="$3" expected="$4"
  local value
  value=$(curl -sf --max-time "$TIMEOUT" "$url" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field','__MISSING__'))" 2>/dev/null || echo "__FAILED__")
  if [[ "$value" == "$expected" ]]; then
    pass "$desc ($field=$expected)"
    return 0
  else
    fail "$desc — expected $field=$expected, got $value"
    return 1
  fi
}

# ── Run smoke tests ──────────────────────────────────────────────────────────
header "InvoiceFi-Stellar Smoke Test Suite"
info "Target: $BASE_URL"
info "Timeout: ${TIMEOUT}s"
info "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ── 1. Health checks ──────────────────────────────────────────────────────────
section "1. Health & Connectivity"

http_check "Backend /api/health" "$BASE_URL/api/health" 200
http_check "Frontend index" "$BASE_URL/" 200
http_check "Frontend /app route" "$BASE_URL/app" 200

# ── 2. API endpoints ──────────────────────────────────────────────────────────
section "2. API Core Endpoints"

# Public endpoints (no auth required)
http_check "API /api/metrics" "$BASE_URL/api/metrics" 200

# Check JSON response shape — health endpoint should return status
json_field_check "Health response shape" "$BASE_URL/api/health" "status" "ok" 2>/dev/null || \
  json_field_check "Health response shape (alt)" "$BASE_URL/api/health" "healthy" "true" 2>/dev/null || \
  info "Health response shape unknown (not blocking)"

# ── 3. Contract endpoints ──────────────────────────────────────────────────────
section "3. Contract Read Queries"

if [[ -n "$HORIZON_URL" ]]; then
  http_check "Horizon reachable" "$HORIZON_URL" 200
  json_field_check "Horizon network passphrase" "$HORIZON_URL" "network_passphrase" "Public Global Stellar Network ; September 2015" 2>/dev/null || \
    info "Horizon network passphrase check skipped (not mainnet = expected)"
else
  info "Horizon URL not provided — skipping Stellar network checks"
fi

# ── 4. Environment configuration ──────────────────────────────────────────────
section "4. Configuration"

# Check that production headers are set
CSP=$(curl -sf -o /dev/null -w "%{header_content_security_policy}" "$BASE_URL" 2>/dev/null || echo "")
if [[ -n "$CSP" ]]; then
  pass "Content-Security-Policy header present"
else
  info "CSP header not checked (may not be set at reverse proxy level)"
fi

# ── 5. Response time check ─────────────────────────────────────────────────────
section "5. Performance (under threshold)"

TIMING=$(curl -sf -w "%{time_total}" -o /dev/null --max-time "$TIMEOUT" "$BASE_URL/api/health" 2>/dev/null || echo "999")
if (( $(echo "$TIMING < 3.0" | bc -l) )); then
  pass "API response time: ${TIMING}s (threshold: 3.0s)"
else
  fail "API response time: ${TIMING}s (exceeds 3.0s threshold)"
fi

# ── Results ────────────────────────────────────────────────────────────────────
header "Results"
echo ""
if [[ "$FAILED" -eq 0 ]]; then
  echo "🎉 All smoke tests passed!"
  echo ""
  echo "Ready for traffic cutover."
else
  echo "⚠️  $FAILED smoke test(s) failed."
  echo "Review failures above before proceeding with cutover."
fi
echo ""
info "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

exit "$FAILED"

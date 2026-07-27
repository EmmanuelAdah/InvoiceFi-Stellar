# InvoiceFi-Stellar – Rollback Procedure

> **Target completion time:** Under 10 minutes  
> **Applies to:** Backend, Frontend, and Contract WASM deployments  
> **Prerequisite:** The previous deployment's Docker images are still tagged as `:blue` or `:green` in the container registry.

---

## 1. Detection Triggers

A rollback is warranted when any of the following occur after a deployment:

- **Health check failure:** `GET /api/health` returns non-200 for >30s after cutover
- **Error rate spike:** 5xx rate exceeds 5% of requests in a 1-minute window
- **Smoke test regression:** A smoke test that passed pre-deployment now fails
- **Contract transaction failure:** `soroban contract invoke` returns unexpected errors
- **User-reported critical bug:** Confirmed by on-call engineer within 15 minutes of deployment

---

## 2. Immediate Mitigation (First 60 Seconds)

### 2.1 Stop the bleeding

```bash
# SSH into the production host
ssh deploy@<production-host>

# Check which color is currently active
cat /tmp/active-color.txt  # Returns "blue" or "green"
```

### 2.2 Revert traffic to the previous color

```bash
# If the incident happened DURING or IMMEDIATELY AFTER cutover,
# the idle color still has the old, working deployment.
# Simply switch the active color file and reload the load balancer:

echo "<idle-color>" > /tmp/active-color.txt
docker exec invoicefi_lb nginx -s reload

# Example: if active=green and deployment broke, switch back to blue:
# echo "blue" > /tmp/active-color.txt
```

### 2.3 Verify rollback

```bash
curl -sf -o /dev/null -w "%{http_code}" https://app.invoicefi.io/api/health
# Expected: 200

curl -sf https://app.invoicefi.io/api/health
# Expected: {"status":"ok"}
```

---

## 3. Full Rollback (Under 10 Minutes)

If the traffic switch alone doesn't resolve the issue (e.g., the idle environment also has problems), perform a full rollback.

### 3.1 Rollback Backend

```bash
ssh deploy@<production-host>

# Identify the previous working image tag
docker images invoicefi-backend --format "table {{.Tag}}\t{{.CreatedAt}}" | head -10
# Pick the tag from before the failed deployment (e.g., sha-abc123def)

# Rollback the Docker service
docker service update \
  --image invoicefi-backend:sha-abc123def \
  invoicefi_backend_<color>
```

### 3.2 Rollback Frontend

```bash
docker images invoicefi-frontend --format "table {{.Tag}}\t{{.CreatedAt}}" | head -10
# Pick the tag from before the failed deployment

docker service update \
  --image invoicefi-frontend:sha-abc123def \
  invoicefi_frontend_<color>
```

### 3.3 Rollback Contract WASM

Contract rollbacks are **different** from container rollbacks. Soroban contract state changes
are irreversible once committed. The rollback strategy is:

1. **Install the previous WASM version** as a new contract instance:
   ```bash
   soroban contract install \
     --wasm /opt/invoicefi/wasm/<contract>_<previous-sha>.wasm \
     --rpc-url $MAINNET_RPC_URL \
     --network-passphrase "Public Global Stellar Network ; September 2015"
   ```

2. **Upgrade the contract** to point to the previous WASM hash:
   ```bash
   soroban contract upgrade \
     --id $CONTRACT_ID \
     --wasm-hash <previous-wasm-hash> \
     --rpc-url $MAINNET_RPC_URL
   ```

3. **Verify** the contract is running the expected version:
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --fn version \
     --rpc-url $MAINNET_RPC_URL
   ```

> **Contract rollback caveats:**
> - State schema changes between versions may cause migration issues
> - Always verify with a `--simulate` call before the state-changing upgrade
> - If the state schema changed incompatibly, you may need a migration contract

---

## 4. Post-Rollback Verification

```bash
# ── Health check ──
curl -sf https://app.invoicefi.io/api/health

# ── API smoke ──
curl -sf https://app.invoicefi.io/api/metrics | head -5

# ── Transaction verification ──
# Send a test transaction through the repro path
soroban contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --fn total_minted \
  --rpc-url $MAINNET_RPC_URL

# ── Monitor logs for 2 minutes ──
ssh deploy@<production-host> "journalctl -u invoicefi-backend -n 50 --no-pager"
```

---

## 5. Post-Mortem

After the rollback is complete and service is restored:

1. **Tag the failing deployment** in your monitoring system (e.g., rollback-trigger event)
2. **Create a GitHub issue** documenting:
   - What was deployed (commit SHA)
   - Failure symptom
   - Rollback duration
   - Root cause (once determined)
3. **Block the failing commit** from re-deploying until fixed (add to `.github/deploy-blocklist`)
4. **Restore from deploy-blocklist** after the fix is merged:
   ```bash
   # Remove the commit SHA from deploy-blocklist
   git rm .github/deploy-blocklist/<sha>
   ```

---

## 6. Automation (Recommended)

For faster rollbacks, consider setting up:

1. **Automated health-check watcher** — A cron job that polls `/api/health` every 30s
   and triggers an automatic rollback after 3 consecutive failures
2. **GitHub Actions rollback dispatch** — A `workflow_dispatch` action that:
   - Reads the last known good deployment from deployment history
   - Re-deploys the previous commit
3. **Slack/PagerDuty integration** — Alert the on-call engineer when a rollback occurs

---

## Appendix: Quick-Reference Commands

| Action | Command |
|--------|---------|
| Check active color | `cat /tmp/active-color.txt` |
| Switch traffic | `echo "<color>" > /tmp/active-color.txt && docker exec invoicefi_lb nginx -s reload` |
| Health check | `curl -sf https://app.invoicefi.io/api/health` |
| View recent logs | `ssh deploy@<host> "journalctl -u invoicefi-backend -n 100 --no-pager"` |
| List backend images | `docker images invoicefi-backend` |
| Rollback service | `docker service update --image invoicefi-backend:<tag> invoicefi_backend_<color>` |
| Contract version | `soroban contract invoke --id $ID --fn version` |

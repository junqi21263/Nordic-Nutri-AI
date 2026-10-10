# Production CloudBase Function Inventory

Environment: `lewis-healthy-d4glgqqzv73a5bc10` (Shanghai).

`cloudbaserc.json` lists repository-managed production deployments. The following
exceptions are intentional and must be reviewed before changing production
routing:

- `nordic-api` now uses the manifest's 60 second timeout; its previous Prod
  setting was 10 seconds.
- `vision-image-purge-dispatcher` remains an Event function on `Nodejs20.19`.
  CloudBase does not change a function runtime in place; this matches the
  existing production function and preserves its daily timer.
- `food-image-batch-dispatcher` retains its enabled every-minute timer; the
  production manifest now records that existing trigger.
- `hunyuan-image-worker` and `nutrition-insight-worker` are Dev-only workers.
  Their stale production copies had Event type, no environment variables, and
  no triggers, and are not used by the production caller. They are excluded
  from the production manifest.
- `nordic-ai-worker-prod` is a legacy production HTTP dependency called by
  `get-login-ticket`. On 2026-10-10, the downloaded production code ZIP matched
  CloudBase's SHA-256 `5382b5d3015e74aaca007f3faeb436f1af78899ec7db80f31e4404707f777189`.
  Its root `index.js`, test, README, package manifest, and bootstrap match the
  tracked `cloudbase/functions/hunyuan-image-worker/` files byte for byte.
  Production runs this code under a different function name; its seven variable
  names include `CLOUDBASE_APIKEY` and `CLOUDBASE_APIKEY_ID`, although that
  source README says not to set permanent API credentials in this worker.
  Variable values and runtime behavior were not inspected. Keep this function
  outside `cloudbaserc.json` until its caller, variable requirements, and a
  tested cutover are independently reconciled; do not delete it as a stale copy.

Production database reconciliation applied through the migration registry:

| Version | Migration | Result |
|---|---|---|
| `20261010035300` | `admin_audit_logs_schema_reconcile` | `Succeed` |
| `20261010035400` | `ops_observability_schema_reconcile` | `Succeed` |

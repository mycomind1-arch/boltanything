# S6 — Preview, Deploy, Telemetry, Hardening, Launch

**Depends on:** S0–S5  
**Produces:** WebContainer live preview, Vercel deploy pipeline, Sentry + PostHog telemetry, security hardening, operator runbook, 14-gate launch checklist  
**Done signal:** `scripts/launch-checklist.ts` exits 0 twice in a row

---

## S6.1 — File layout

```
src/
├── components/build/tabs/
│   └── PreviewTab.tsx                          ← REWRITTEN (replaces S4 stub)
├── lib/anything/
│   ├── preview/
│   │   ├── webcontainer.client.ts              ← boot/teardown, singleton per tab
│   │   ├── mount-files.client.ts               ← build_files → WebContainer fs
│   │   └── use-preview.ts                      ← hook: status + iframe url + logs
│   ├── deploy/
│   │   ├── deploy.functions.ts                 ← deploy.start / deploy.status / deploy.cancel
│   │   ├── vercel.server.ts                    ← Vercel REST wrapper (replaces inert stub)
│   │   └── snapshot.server.ts                  ← build_files → Vercel-format file array
│   └── telemetry/
│       ├── sentry.client.ts
│       ├── sentry.server.ts
│       ├── posthog.client.ts
│       ├── events.ts
│       └── wrap-server-fn.ts
├── lib/anything/security/
│   ├── rate-limit.server.ts
│   ├── csp.ts
│   └── headers.server.ts
├── components/build/
│   ├── DeployButton.tsx
│   └── DeployStatusBadge.tsx
└── routes/
    ├── api/public/vercel/callback.tsx
    ├── api/public/vercel/domain.tsx
    └── _authenticated/admin.tsx

supabase/migrations/
├── <ts>_builds_deploy_fields.sql
└── <ts>_rls_lockdown.sql

scripts/
├── launch-checklist.ts
└── rotate-secrets.ts

docs/
├── architecture.md
├── runbook.md
└── launch.md
```

---

## S6.2 — Schema delta

**File:** `supabase/migrations/<ts>_builds_deploy_fields.sql`

Additive only. Still 6 tables total.

```sql
ALTER TABLE public.builds
  ADD COLUMN IF NOT EXISTS deploy_status text
    NOT NULL DEFAULT 'none'
    CHECK (deploy_status IN ('none','queued','building','ready','error','canceled')),
  ADD COLUMN IF NOT EXISTS deploy_url      text,
  ADD COLUMN IF NOT EXISTS deploy_id       text,
  ADD COLUMN IF NOT EXISTS deployed_at     timestamptz;
```

No new tables. `costs` table was added in S5 and is not counted in the 6-table public surface.

---

## S6.3 — WebContainer preview

### S6.3.1 — Setup requirements

```bash
bun add @webcontainer/api
```

Add to `package.json` `"browser"` field or vite config:
```js
optimizeDeps: { exclude: ['@webcontainer/api'] }
```

COOP/COEP headers on `/_authenticated/*` (set in S4 root layout and tightened here in `headers.server.ts`):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### S6.3.2 — `webcontainer.client.ts`

```typescript
import { WebContainer } from '@webcontainer/api';
let _instance: WebContainer | null = null;

export async function getOrBootWebContainer(): Promise<WebContainer> {
  if (_instance) return _instance;
  _instance = await WebContainer.boot();
  window.addEventListener('beforeunload', () => _instance?.teardown());
  return _instance;
}

export async function teardownWebContainer(): Promise<void> {
  await _instance?.teardown();
  _instance = null;
}
```

**Singleton per browser tab.** Cross-build reuse: re-mount files; do not re-boot.

### S6.3.3 — `mount-files.client.ts`

```typescript
// Streams build_files into WebContainer filesystem
// Parallelism: ≤8 concurrent writes

const MANIFEST_CACHE = new Map<string, string>(); // path → contentHash

export async function mountBuildFiles(
  wc: WebContainer,
  buildId: string,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  const files = await builds.snapshot({ buildId }).then(s => s.files);
  const toMount: FileRow[] = files.filter(f => {
    const hash = simpleHash(f.content);
    if (MANIFEST_CACHE.get(f.path) === hash) return false;
    MANIFEST_CACHE.set(f.path, hash);
    return true;
  });

  let loaded = 0;
  await pLimit(8, toMount.map(file => async () => {
    await wc.fs.writeFile(file.path, file.content);
    onProgress(++loaded, toMount.length);
  }));
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
```

### S6.3.4 — `use-preview.ts`

```typescript
type PreviewStatus = 'idle'|'mounting'|'installing'|'starting'|'ready'|'error';

interface PreviewState {
  status:   PreviewStatus;
  url:      string | null;
  logs:     string[];
  progress: { loaded: number; total: number };
}
```

Lifecycle:
1. `idle` → wait for `build.status === 'succeeded'`
2. `mounting` → `getOrBootWebContainer()` then `mountBuildFiles(...)`
3. `installing` → detect `package.json`; if present: `wc.spawn('npm', ['install'])`, stream output to `logs`
4. `starting` → detect framework; run dev command; listen for `server-ready` → get URL
5. `ready` → `url` is set, iframe renders
6. On error: set `status='error'`, log message, expose "Retry" button

Framework detection (from `package.json` `scripts.dev` or `dependencies`):
- `vite` → `npm run dev`
- `next` → `npm run dev`  
- `astro` → `npm run dev`
- No `package.json` or no scripts → `npx serve .`

### S6.3.5 — `PreviewTab.tsx` (full rewrite)

```tsx
export function PreviewTab({ build }: { build: BuildRow }) {
  const { status, url, logs, progress } = usePreview(build.id, build.status);

  return (
    <div className="preview-tab">
      <div className="preview-toolbar">
        <StatusPill status={status} progress={progress} />
        {url && <button onClick={() => window.open(url)}>Open in new tab</button>}
        {status === 'ready' && <button onClick={reload}>Reload</button>}
      </div>

      {status === 'ready' && url ? (
        <iframe
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
          className="preview-iframe"
        />
      ) : (
        <PreviewLogs logs={logs} status={status} />
      )}
    </div>
  );
}
```

`PreviewLogs` renders the install/start log stream in a scrollable monospace pane.

---

## S6.4 — Vercel deploy

### S6.4.1 — New secrets

Add via `add_secret`:
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` (optional — only for team accounts)
- `VERCEL_PROJECT_ID`
- `VERCEL_DEPLOY_WEBHOOK_SECRET`

### S6.4.2 — `deploy/vercel.server.ts` (replaces inert stub)

```typescript
const VERCEL_API = 'https://api.vercel.com';

async function headers() {
  return {
    'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export const vercel = {
  async createDeployment(opts: {
    files: Array<{ file: string; data: string; encoding: 'base64'|'utf8' }>;
    meta:  Record<string,string>;
  }): Promise<{ id: string; url: string; inspectorUrl: string }> {
    const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
    const res = await fetch(`${VERCEL_API}/v13/deployments${teamQuery}`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({
        name: process.env.VERCEL_PROJECT_ID,
        files: opts.files,
        target: 'production',
        meta: opts.meta,
      }),
    });
    if (!res.ok) throw new Error(`Vercel deploy failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async cancelDeployment(deployId: string): Promise<void> {
    const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
    await fetch(`${VERCEL_API}/v12/deployments/${deployId}/cancel${teamQuery}`, {
      method: 'POST',
      headers: await headers(),
    });
  },

  async getDeployment(deployId: string): Promise<{ state: string; url: string }> {
    const res = await fetch(`${VERCEL_API}/v13/deployments/${deployId}`, {
      headers: await headers(),
    });
    return res.json();
  },
};
```

### S6.4.3 — `deploy/snapshot.server.ts`

```typescript
export async function buildVercelFiles(buildId: string): Promise<Array<{
  file: string; data: string; encoding: 'base64'|'utf8'
}>> {
  const files = await db.files.byBuild(buildId);
  // Snapshot guard
  const failed = files.filter(f => f.evidence_status === 'failed');
  if (failed.length > 0) throw new Error(`${failed.length} files with failed evidence`);
  const totalBytes = files.reduce((n, f) => n + f.content.length, 0);
  if (totalBytes > 50 * 1024 * 1024) throw new Error('Build exceeds 50 MB deploy cap');

  return files.map(file => ({
    file: file.path,
    data: file.content,
    encoding: 'utf8' as const,
  }));
}
```

### S6.4.4 — `deploy/deploy.functions.ts`

Three owner-gated server fns:

**`deploy.start({buildId})`:**
1. Load build; assert `status === 'succeeded'`
2. `buildVercelFiles(buildId)`
3. `cost.checkBudget(buildId)` — block runaway costs before billing Vercel
4. `vercel.createDeployment({files, meta: {anythingBuildId: buildId}})`
5. Update build: `deploy_status='queued'`, `deploy_id`, `deploy_url`
6. `cost.recordCall({buildId, model:'vercel:deploy', inputTokens:0, outputTokens:0, cents: deployBaseCents})`
7. Return `{deployId, url, inspectorUrl}`

**`deploy.status({buildId})`:** Return current `{deploy_status, deploy_url, deployed_at}` from DB. Optionally refresh from Vercel API if `deploy_status ∈ {queued,building}` and last update > 30 s ago.

**`deploy.cancel({buildId})`:** `vercel.cancelDeployment(build.deploy_id)`; set `deploy_status='canceled'`.

### S6.4.5 — Webhook: `/api/public/vercel/callback.tsx`

```typescript
// HMAC-verify x-vercel-signature with VERCEL_DEPLOY_WEBHOOK_SECRET
// Map Vercel event types:
const STATUS_MAP: Record<string, string> = {
  'deployment.created': 'building',
  'deployment.ready':   'ready',
  'deployment.error':   'error',
  'deployment.canceled':'canceled',
};
// Update builds row; append aiol_messages log
// Set deployed_at when status → 'ready'
```

### S6.4.6 — `components/build/DeployButton.tsx`

```tsx
// Enabled only when: build.status === 'succeeded' AND deploy_status ∈ {none,error,canceled}
// Shows spinner while deploy_status ∈ {queued,building}
// On click: calls deploy.start({buildId})
```

### S6.4.7 — `components/build/DeployStatusBadge.tsx`

Pure display. Reads `build.deploy_status` and `build.deploy_url` from the existing `useBuildStream` subscription — no extra polling needed (builds table already in Realtime publication).

```
none      → hidden
queued    → "Deploy queued" (muted)
building  → "Deploying…" (pulsing)
ready     → "Live ↗" (success, link to deploy_url)
error     → "Deploy failed" (destructive)
canceled  → "Canceled" (muted)
```

---

## S6.5 — Telemetry

### S6.5.1 — Sentry

```typescript
// sentry.client.ts — lazy, loaded on first error or after 3s idle
import type { BrowserOptions } from '@sentry/react';

let initialized = false;
export async function initSentry() {
  if (initialized || !import.meta.env.VITE_SENTRY_DSN) return;
  initialized = true;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
    ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection'],
  });
}

// sentry.server.ts — per-request (Workers: no module-scope init)
export async function captureServerError(
  err: unknown,
  ctx: { serverFn: string; buildId?: string; userId?: string }
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/cloudflare');
  Sentry.withScope(scope => {
    scope.setTag('serverFn', ctx.serverFn);
    if (ctx.buildId) scope.setTag('buildId', ctx.buildId);
    if (ctx.userId)  scope.setUser({ id: ctx.userId });
    Sentry.captureException(err);
  });
}

// wrap-server-fn.ts
export function withTelemetry<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      await captureServerError(err, { serverFn: name });
      throw err;
    }
  }) as T;
}
```

Wrap every server fn in `builds.functions.ts`, `deploy.functions.ts`, `vault/*`, `cycle.server.ts`, `tick.server.ts` with `withTelemetry('name', async () => {...})`.

### S6.5.2 — PostHog

```typescript
// posthog.client.ts
let ph: any = null;
export async function initPostHog(userId: string) {
  if (ph || !import.meta.env.VITE_POSTHOG_KEY) return;
  const { default: posthog } = await import('posthog-js');
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
  });
  posthog.identify(userId);
  ph = posthog;
}

export function track(event: EventName, props?: Record<string,unknown>) {
  ph?.capture(event, sanitize(props));
}

// Never include directive text or file content in props
function sanitize(props?: Record<string,unknown>): Record<string,unknown> {
  const { directive, content, ...safe } = props ?? {};
  return safe;
}
```

```typescript
// events.ts — canonical event name list
export type EventName =
  | 'build.started' | 'build.succeeded' | 'build.failed'
  | 'cycle.started' | 'cycle.stopped'
  | 'deploy.started' | 'deploy.succeeded' | 'deploy.failed'
  | 'preview.booted' | 'preview.error'
  | 'chat.message.sent'
  | 'vault.hit_used';
```

Add `track(event, props)` calls at the right moments:
- `builds.start()` → `build.started`
- Callback sink on `vault scope:write` → `build.succeeded`  
- `builds.cancel()` → `build.failed`
- `deploy.start()` → `deploy.started`
- Vercel webhook `ready` → `deploy.succeeded`
- `use-preview.ts` `status='ready'` → `preview.booted`

---

## S6.6 — Rate limiting

**File:** `src/lib/anything/security/rate-limit.server.ts`

```typescript
// Upstash sliding window. Gracefully degrades if Upstash not configured.
export async function checkRateLimit(opts: {
  key:         string;
  limit:       number;
  window:      number;  // seconds
}): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (!process.env.UPSTASH_REDIS_URL) return { allowed: true }; // degrade gracefully

  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis }     = await import('@upstash/redis');
  const rl = new Ratelimit({
    redis: new Redis({ url: process.env.UPSTASH_REDIS_URL!, token: process.env.UPSTASH_REDIS_TOKEN! }),
    limiter: Ratelimit.slidingWindow(opts.limit, `${opts.window} s`),
  });
  const { success, reset } = await rl.limit(opts.key);
  return { allowed: success, retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000) };
}
```

**Apply in:**
- `/api/chat` → `rl:chat:<userId>` (10/60s)
- `builds.start` → `rl:builds.start:<userId>` (20/3600s)
- `/api/public/n8n/callback` → `rl:public:n8n:<ip>` (60/60s)
- `/api/public/vercel/callback` → `rl:public:vercel:<ip>` (30/60s)
- `deploy.start` → `rl:deploy:<userId>` (5/3600s)

When rate limited, return HTTP 429 with `Retry-After: <seconds>` header.

---

## S6.7 — Security headers + CSP

**File:** `src/lib/anything/security/csp.ts`

```typescript
export type CspProfile = 'default' | 'app';

export function buildCsp(profile: CspProfile): string {
  const base = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (profile === 'default') {
    return [
      ...base,
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.posthog.com",
      "frame-src 'none'",
    ].join('; ');
  }

  // app profile — adds WebContainer requirements
  return [
    ...base,
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",  // WC requires unsafe-eval
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.posthog.com https://cdn.jsdelivr.net",
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join('; ');
}
```

**File:** `src/lib/anything/security/headers.server.ts`

Applied as `requestMiddleware` in `src/server.ts` (append — do not replace existing middleware):

```typescript
export function securityHeaders(path: string): Record<string,string> {
  const profile: CspProfile = path.startsWith('/_authenticated') ? 'app' : 'default';
  const headers: Record<string,string> = {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': buildCsp(profile),
  };
  if (profile === 'app') {
    headers['Cross-Origin-Opener-Policy']   = 'same-origin';
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  }
  return headers;
}
```

---

## S6.8 — RLS lockdown migration

**File:** `supabase/migrations/<ts>_rls_lockdown.sql`

```sql
-- Re-assert RLS on all 6 tables (idempotent)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'builds','agents','jobs','aiol_messages','build_files','vault_entries'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- is_owner security-definer function (idempotent)
CREATE OR REPLACE FUNCTION public.is_owner(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = uid
      AND u.email = current_setting('app.owner_email', true)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_owner(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;

-- Verify every table has the owner_select and service_role_all policies
-- If missing, re-create them. Safe to re-run.
DO $$
DECLARE
  tables text[] := ARRAY['builds','agents','jobs','aiol_messages','build_files','vault_entries'];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop and recreate to ensure they're current
    EXECUTE format('DROP POLICY IF EXISTS owner_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY owner_select ON public.%I FOR SELECT TO authenticated
       USING (public.is_owner(auth.uid()))', t);
    EXECUTE format(
      'CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role
       USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;
```

---

## S6.9 — `scripts/launch-checklist.ts`

14-gate go/no-go. Exits nonzero on first failure.

| # | Gate | Test |
|---|---|---|
| 1 | Secrets present | All required secrets visible via `fetch_secrets`; lists names of any missing |
| 2 | Schema + RLS | All 6 tables exist; RLS enabled; `is_owner()` function present; `costs` table present |
| 3 | Realtime publication | All 6 public tables in `supabase_realtime` publication |
| 4 | HMAC on all public routes | Send wrong sig to each `/api/public/*` → all return 401 |
| 5 | Owner gate | Anon GET `/_authenticated/` → 302 to `/auth`; non-owner JWT → 403 |
| 6 | E2E build | Re-runs `verify-end-to-end.ts` gates 1–3 → succeeds in ≤ 60 s |
| 7 | Auto-cycle + budget guard | Runs S5 gates 6 + 7 |
| 8 | Vault round-trip | Two consecutive builds; second shows vault hits in `aiol_messages` |
| 9 | Repair loop | Injected broken file → repair fires once → build succeeds |
| 10 | Deploy round-trip | `deploy.start` → poll until `deploy_status='ready'` (≤ 5 min) → `deploy_url` returns HTTP 200 |
| 11 | Sentry capture | Force thrown error in test server fn → Sentry ingest confirms event with `buildId` tag (skipped if `SENTRY_DSN` absent) |
| 12 | PostHog event | Force `build.started` event → PostHog ingest API confirms (skipped if `VITE_POSTHOG_KEY` absent) |
| 13 | Rate limit | 21 `builds.start` calls in < 1 hr → 21st returns 429 with `Retry-After` header |
| 14 | Security scan | `security--run_security_scan` → zero high/critical findings; info findings logged only |

---

## S6.10 — Admin page (`/_authenticated/admin`)

Owner-only. Hidden from main nav. Accessible at `?admin=1` query param on the main route OR via direct URL.

Sections:
- **System health:** cron last-tick timestamp, pg_net last fired, `jobs` queue depth
- **Recent builds:** last 20 builds with status, cost, deploy_status, directive, links to UI
- **Vault:** entry count, last write timestamp, embed dimension check
- **Telemetry config:** presence pills for SENTRY_DSN, POSTHOG_KEY (green/red, no values shown)
- **Launch checklist runner:** "Run checklist" button → streams `launch-checklist.ts` output line-by-line via server fn SSE

---

## S6.11 — Documentation

### `docs/architecture.md`

One-page system diagram (ASCII) + 6 invariants:

```
1. Single owner — ownerGuard on every protected fn, is_owner() in every RLS policy
2. 6 tables — no new public tables without explicit spec revision
3. No env at module scope — imports and env reads inside handler bodies only
4. HMAC on every public route — before any DB write, no exceptions
5. .server.ts is server-only — zero client-bundle imports, ripgrep enforced
6. Semantic tokens only — no hardcoded colors or pixel values outside anything.css
```

### `docs/runbook.md`

Incident playbooks for:
- Stuck `claimed` jobs (diagnosis query + recycle command)
- n8n down (orchestrator behavior + manual re-queue steps)
- Vercel down (deploy_status stuck + fallback to WebContainer-only mode)
- Cost runaway (`BUILD_BUDGET_CENTS` override + cancel command)
- Vault corruption (re-embed all entries via `seed-vault.ts --rebuild`)
- RLS regression (detection query + `_rls_lockdown.sql` re-run procedure)

### `docs/launch.md`

Human-readable version of `launch-checklist.ts` gates 1–14. Matches script output 1:1. Used for manual audit.

---

## S6.12 — Verification gates

**S6 is done only when all 10 pass.**

| # | Gate | How to verify |
|---|---|---|
| G6-1 | Clean build | Fresh clone + `bun install` + `tsc --noEmit` + `bun run build` → all exit 0; zero module-scope env reads |
| G6-2 | Launch checklist idempotent | `bun run scripts/launch-checklist.ts` exits 0; run again immediately → exits 0 again |
| G6-3 | WebContainer preview | Smoke build from G6-2 → PreviewTab shows `ready` status with live iframe in ≤ 15 s; Reload works; switching to a second build reuses WC instance (no re-boot in console) |
| G6-4 | Deploy round-trip | DeployButton → Vercel build → webhook callback → `deploy_status='ready'` badge green → `deploy_url` opens deployed app in new tab |
| G6-5 | Sentry tag | Deliberately throw in `builds.start` wrapper → Sentry event appears in dashboard with `buildId` and `serverFn` tags |
| G6-6 | PostHog events | Confirm `build.started` + `deploy.succeeded` events in PostHog with matching `buildId` |
| G6-7 | Rate limit | 21 rapid `builds.start` calls → 21st returns 429 `Retry-After` header present |
| G6-8 | RLS non-owner isolation | Second Supabase JWT (not owner) → direct PostgREST query on `aiol_messages` returns empty, not 403 (RLS filters, doesn't error) |
| G6-9 | CSP profile split | Auth page CSP: `frame-src 'none'`; app page CSP: `frame-src 'self' blob:` + COEP/COOP present |
| G6-10 | Graceful degradation | Remove `SENTRY_DSN`, `VITE_POSTHOG_KEY`, `UPSTASH_REDIS_URL` → app boots, builds succeed, no crashes; only warn logs |

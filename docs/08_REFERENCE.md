# Reference — Codebook, Taxonomy, Blocklist, Risks, Secrets

**This file is read-only reference material for builder LLMs. Do not edit it while building.**

---

## R1 — Agent code taxonomy (from seed codebook)

Used as `role` enum labels and `aiol_messages.from_agent` / `to_agent` prefixes.

| Code | Role | Sequence owned |
|---|---|---|
| `ORC` | Orchestrator (tick loop, callback sink) | S2 |
| `ARCH` | Architect (decomposes directives) | S2/S3 |
| `CODER` | Coder (generates files per capability) | S2/S3 |
| `QA` | Critic / evidence gate | S2/S3 |
| `DOC` | Docwright (README + tests) | S2/S3 |
| `VAULT` | Librarian (vault read/write) | S2/S3/S5 |
| `N8N` | n8n workflow (any workflow-side origin) | S3 |
| `SB` | Supabase tool endpoint | S3 |
| `SYS` | System / cron / internal | S2 |

### AIOL message ID prefix format

Message IDs in logs and `aiol_messages.from_agent` use:
```
CODE:base36timestamp-randomsuffix
```
Example: `ARCH:lxk4m2-r7q1z`

This keeps `aiol_messages` human-scannable in the SQL editor.

---

## R2 — AIOL message shapes by kind

### `plan` — ARCHITECT → ORC
```json
{
  "kind": "plan",
  "body": {
    "capabilities": [
      {
        "name": "slug",
        "intent": "one sentence",
        "files": ["path/to/file.ts"],
        "depends_on": ["other-capability-slug"]
      }
    ]
  }
}
```

### `evidence` from CODER → ORC
```json
{
  "kind": "evidence",
  "body": {
    "from": "coder",
    "files": [{ "path": "", "content": "", "mime": "" }],
    "input_tokens": 1200,
    "output_tokens": 4800
  }
}
```

### `evidence` from CRITIC → ORC
```json
{
  "kind": "evidence",
  "body": {
    "from": "critic",
    "results": [{ "path": "", "status": "ok|failed", "notes": "" }],
    "agent_status": "ok|failed"
  }
}
```

### `repair` — CODER (repair mode) → ORC
```json
{
  "kind": "repair",
  "body": {
    "files": [{ "path": "", "content": "" }]
  }
}
```

### `vault` scope=read — LIBRARIAN → ORC
```json
{
  "kind": "vault",
  "body": {
    "scope": "read",
    "hits": [{ "id": "", "pattern": "", "evidence": {}, "why": "" }]
  }
}
```

### `vault` scope=write — LIBRARIAN → ORC
```json
{
  "kind": "vault",
  "body": {
    "scope": "write",
    "entry": {
      "pattern": "",
      "evidence": { "capabilities": [], "file_count": 0, "key_files": [] },
      "next_use_case": ""
    }
  }
}
```

### `spawn` — any agent requesting a child
```json
{
  "kind": "spawn",
  "body": {
    "spawn_children": [
      { "role": "architect", "payload": { "capability": {} } }
    ]
  }
}
```
ORC honors this only if all cap checks pass (depth ≤ 3, fanout ≤ 5, budget < 40).

### `collapse` — any agent announcing completion
```json
{
  "kind": "collapse",
  "body": { "summary": "optional one-liner" }
}
```

### `log` — any → ORC (append-only)
```json
{
  "kind": "log",
  "body": { "level": "info|warn|error", "message": "" }
}
```

---

## R3 — Mandelbrot recursion caps

| Cap | Value | Enforced in |
|---|---|---|
| Max depth | 3 (ROOT=0, ARCH=1, CODER=2, FILEWRIGHT=3) | `caps.server.ts` + `spawn.server.ts` |
| Max fanout per parent | 5 children | `caps.server.ts` |
| Max agents per build | 40 | `caps.server.ts` |
| Max repair attempts per capability | 2 | `callback.server.ts` |
| Max auto-cycles per lineage | 3 | `cycle.server.ts` |
| Max cost per build | env `BUILD_BUDGET_CENTS` (default 100¢) | `cost.server.ts` |
| Max cost per auto-cycle chain | env `CYCLE_BUDGET_CENTS` (default 10¢) | `cycle.server.ts` |

---

## R4 — Hard blocklist (from seed — stub for future cycle)

The following patterns must **never** appear in generated file content. `static_lint.server.ts` enforces these in the evidence gate.

```typescript
export const HARD_BLOCKLIST = [
  // Remote code execution
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\b/,
  // Process control
  /\bprocess\.exit\b/,
  /\bprocess\.kill\b/,
  // Cloud metadata services
  /169\.254\.169\.254/,
  /metadata\.google\.internal/,
  /metadata\.aws\./,
  // Exfil patterns
  /document\.cookie/,
  /localStorage\.getItem.*password/i,
  // Credential literals (rough heuristic)
  /sk-[A-Za-z0-9]{32,}/,        // OpenAI key
  /AKIA[0-9A-Z]{16}/,           // AWS key
  /ghp_[A-Za-z0-9]{36}/,        // GitHub PAT
] as const;
```

**Approval queue (scaffolded inert — wire in future cycle):**

When a generated file triggers a blocklist match, it should be routed through an `approvalQueue` where the owner can manually approve the exception. In v1, any blocklist match fails the evidence gate unconditionally with no approval path.

---

## R5 — Complete secrets checklist

### Auto-provisioned by Lovable Cloud (S0.1)
- `LOVABLE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN` *(if GitHub connector added)*
- `VERCEL_TOKEN` *(if Vercel connector added; else manual)*

### Required manual secrets (S0.2 — batched `add_secret`)
| Secret | Used in | Notes |
|---|---|---|
| `N8N_BASE_URL` | S2, S3 | e.g. `https://n8n.yourdomain.com` |
| `N8N_API_KEY` | S3 deploy script | n8n REST API |
| `N8N_WEBHOOK_SECRET` | S2, S3 | Shared HMAC secret, ≥ 32 random chars |
| `INTERNAL_TICK_SECRET` | S2 | Header secret for `/api/internal/tick` |
| `CRON_SECRET` | S2 | Header secret for `/api/public/cron/sweep` |
| `OWNER_EMAIL` | S0, S2, S6 | The one email allowed through `ownerGuard` |

### Optional manual secrets (system degrades gracefully if absent)
| Secret | Used in | Degraded behavior |
|---|---|---|
| `UPSTASH_REDIS_URL` | S1, S6 | Cache disabled; rate-limit disabled |
| `UPSTASH_REDIS_TOKEN` | S1, S6 | Same |
| `STACKBLITZ_TOKEN` | S6 | Not required for `@webcontainer/api` in S6 approach |
| `SENTRY_DSN` | S6 | No error reporting |
| `VITE_SENTRY_DSN` | S6 | No browser error reporting |
| `VITE_POSTHOG_KEY` | S6 | No analytics |
| `VITE_POSTHOG_HOST` | S6 | Defaults to `https://app.posthog.com` |

### S6 deploy secrets (required for Vercel deploy feature)
| Secret | Notes |
|---|---|
| `VERCEL_TOKEN` | From Vercel account settings |
| `VERCEL_TEAM_ID` | Optional; only for team accounts |
| `VERCEL_PROJECT_ID` | The target project name |
| `VERCEL_DEPLOY_WEBHOOK_SECRET` | Set in Vercel project webhook settings |

### Cost control env vars (not secrets — set as env vars)
| Var | Default | Effect |
|---|---|---|
| `BUILD_BUDGET_CENTS` | `100` | Abort a build if total cost exceeds this |
| `CYCLE_BUDGET_CENTS` | `10` | Block auto-cycle if last build cost exceeded this |
| `COST_INPUT_CENTS_PER_1K` | `0.015` | Gemini Flash input price (update on model changes) |
| `COST_OUTPUT_CENTS_PER_1K` | `0.060` | Gemini Flash output price |

---

## R6 — Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gemini Flash rate limit mid-cycle | Medium | Upstash cache for embed calls; retry-on-fail in n8n; graceful `failed` status on `GatewayError` |
| n8n instance down | Medium | pg_cron 30 s sweep re-queues; `attempts ≥ 3` hard-fails job; `aiol_messages` log row inserted |
| Vercel deploy stuck | Low | 90 s timeout in `deploy.status`; `deploy_status='error'`; WebContainer preview stays live |
| pg_net trigger storm | Medium | `FOR UPDATE SKIP LOCKED`; max 5 concurrent claims per tick |
| Schema drift from LLM | High | Evidence gate static lint + AI review + blocked patterns before commit |
| Webhook spoofing | Low | HMAC verification on every `/api/public/*` route before any DB write |
| Service-role key leak | Low | `supabase.server.ts` only imported inside handler bodies; never at module scope |
| Runaway auto-cycle cost | Medium | Hard cap `cycle_count ≤ 3`; `CYCLE_BUDGET_CENTS` budget check before each new cycle |
| WebContainer COOP/COEP breaks auth | Medium | COEP headers scoped to `/_authenticated/*` only; auth + public routes unaffected |
| RLS regression | Low | `_rls_lockdown.sql` is idempotent and re-runnable; launch checklist gate 14 runs security scan |
| Broken repair loop | Medium | Hard stop at `repair_attempts ≥ 2`; parent CODER marked failed; build continues if < 50% capabilities fail |
| Non-owner hits owner API | Low | `ownerGuard` on every server fn; `is_owner()` in every RLS policy; Realtime anon key cannot read service-role data |

---

## R7 — What is explicitly OUT of scope for v1

These items have scaffolding already in the codebase (tables exist, adapter stubs exist) but are **not wired** in S0–S6:

| Item | Scaffolded as | Add in future cycle |
|---|---|---|
| GitHub direct commit | `github.server.ts` stub | Wire `commit_to_repo` workflow |
| Multi-user auth | RLS policies use `is_owner()` | Replace `is_owner()` with `auth.uid() = owner_id`; add `owner_id` FK |
| Vault pattern marketplace | `vault_entries.public` column | Add public read policies; marketplace UI |
| GitHub PR/approval flow | `commit_to_repo` workflow skeleton | Branch mode + PR creation |
| Sandboxed tool execution | Hard blocklist | `approvalQueue` + WebContainer runner |
| Slack/Discord alerts | (none) | Swap `telemetry.server.ts` to include webhook adapter |
| Custom domain wiring | (none) | `vercel.alias` adapter call |
| Mobile-native UI | (none) | Full responsive pass |
| PostHog server-side events | `telemetry.server.ts` stub | Wire into server fn wrappers |

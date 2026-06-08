# S5 — Vault Flywheel + Auto-Cycle + Cost Tracking

**Depends on:** S0–S4  
**Produces:** Full vault read/write pipeline, pgvector index, auto-cycle engine, per-call cost tracking, end-to-end verification script  
**Done signal:** All 8 verification gates pass

---

## S5.1 — File layout

```
src/lib/anything/
├── vault/
│   ├── start.server.ts         ← pgvector search → vault_search_rerank dispatch
│   └── finish.server.ts        ← embed + vault_write dispatch
├── cycle.server.ts             ← auto-cycle trigger + budget guard
├── cost.server.ts              ← per-call cost recording + budget check
└── telemetry.server.ts         ← PostHog server-side events (stub in S5; wired in S6)

src/components/build/
├── CostBadge.tsx               ← live cost display in BuildHeader
└── CycleControl.tsx            ← auto-cycle toggle + cycle depth display

supabase/migrations/
└── <ts>_vault_indexes.sql      ← ivfflat index + costs table

scripts/
├── verify-end-to-end.ts        ← full 9-gate smoke test
└── seed-vault.ts               ← pre-populate vault with 3 bootstrap patterns
```

---

## S5.2 — Migration: `<ts>_vault_indexes.sql`

**Run after at least 10 vault entries exist** (ivfflat requires data). The migration is conditional:

```sql
-- Only create the ivfflat index if vault_entries has at least 10 rows
DO $$
BEGIN
  IF (SELECT count(*) FROM public.vault_entries) >= 10 THEN
    CREATE INDEX IF NOT EXISTS vault_entries_embedding_idx
      ON public.vault_entries
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END
$$;

-- costs table (new, no new public tables counted — this is internal accounting)
CREATE TABLE IF NOT EXISTS public.costs (
  id          uuid primary key default gen_random_uuid(),
  build_id    uuid references public.builds(id) on delete cascade,
  agent_id    uuid references public.agents(id),
  model       text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cents         numeric(10,4) not null default 0,
  created_at  timestamptz default now()
);
CREATE INDEX IF NOT EXISTS costs_build_id_idx ON public.costs(build_id);

ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON public.costs
  FOR SELECT TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "service_role_all" ON public.costs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.costs TO authenticated;
GRANT ALL ON public.costs TO service_role;

-- Add aggregate column to builds for UI display
ALTER TABLE public.builds
  ADD COLUMN IF NOT EXISTS total_cost_cents numeric(10,4) NOT NULL DEFAULT 0;
```

> **Note:** `costs` is an internal accounting table and is deliberately NOT added to the `supabase_realtime` publication (too noisy). `builds.total_cost_cents` IS published (it's on the `builds` table already in the publication).

---

## S5.3 — `vault/start.server.ts`

Called from callback handler when `kind='vault'` + `scope='search'` arrives (triggered by `root.start` → `vault.search` job).

```typescript
export async function startVaultSearch(opts: {
  buildId: string;
  jobId:   string;
  agentId: string;
  directive: string;
}): Promise<void> {
  // 1. Embed the directive
  const embedding = await embedText(opts.directive, opts.buildId);

  // 2. pgvector cosine top-10 (pre-filter before rerank)
  const candidates = await db.vault.searchTop(embedding, 10);

  if (candidates.length === 0) {
    // No vault entries yet — skip rerank, emit empty hits, proceed to decompose
    await db.aiol.append({
      buildId: opts.buildId,
      from: 'VAULT:start',
      to: 'ORC:tick',
      kind: 'vault',
      body: { scope: 'read', hits: [] },
    });
    // Enqueue architect.decompose directly
    await spawn({
      buildId: opts.buildId,
      parentAgentId: opts.agentId,
      role: 'architect',
      jobKind: 'architect.decompose',
      payload: { directive: opts.directive, vault_hits: [] },
    });
    await db.agents.setState(opts.agentId, 'collapsed');
    return;
  }

  // 3. Dispatch vault_search_rerank to n8n with candidates
  await n8n.triggerWorkflow('vault_search_rerank', {
    directive:  opts.directive,
    candidates: candidates.map(c => ({
      id:       c.id,
      pattern:  c.pattern,
      evidence: c.evidence,
      distance: c.distance,
    })),
    agent_id: opts.agentId,
  }, { buildId: opts.buildId, jobId: opts.jobId });
}
```

---

## S5.4 — `vault/finish.server.ts`

Called from callback handler when `kind='vault'` + `scope='write'` arrives.

```typescript
export async function finishVaultWrite(opts: {
  buildId:  string;
  agentId:  string;
  entry: {
    pattern:       string;
    evidence:      Record<string,unknown>;
    next_use_case: string;
  };
}): Promise<void> {
  // 1. Embed the pattern (cached)
  const embedding = await embedText(opts.entry.pattern, opts.buildId);

  // 2. Write to vault
  await db.vault.write({
    buildId:      opts.buildId,
    pattern:      opts.entry.pattern,
    evidence:     opts.entry.evidence,
    embedding,
    nextUseCase:  opts.entry.next_use_case,
  });

  // 3. Mark build succeeded
  await db.builds.updateStatus(opts.buildId, 'succeeded');

  // 4. Log
  await db.aiol.append({
    buildId: opts.buildId,
    from: 'VAULT:finish',
    kind: 'vault',
    body: { scope: 'write', pattern_preview: opts.entry.pattern.slice(0, 80) },
  });

  // 5. Trigger auto-cycle check (non-blocking)
  cycle.checkAutoAdvance(opts.buildId).catch(console.error);
}
```

---

## S5.5 — `cycle.server.ts`

```typescript
const MAX_DEPTH  = 3;
const MAX_CYCLES = 3;   // hard cap per lineage (same parent_build_id chain)

export async function checkAutoAdvance(buildId: string): Promise<void> {
  const build = await db.builds.get(buildId);

  // Only advance if owner explicitly enabled auto_cycle
  if (!build.auto_cycle) return;

  // Count cycles in lineage
  const lineageDepth = await countLineage(buildId);
  if (lineageDepth >= MAX_CYCLES) {
    await db.aiol.append({
      buildId,
      kind: 'log',
      body: { level: 'info', message: 'auto_cycle stopped: depth cap reached' },
    });
    return;
  }

  // Budget guard: abort if estimated next cycle would exceed cost budget
  const budget = parseCents(process.env.CYCLE_BUDGET_CENTS ?? '10');
  const lastCost = await db.costs.sumByBuild(buildId);
  if (lastCost >= budget) {
    await db.aiol.append({
      buildId,
      kind: 'log',
      body: { level: 'warn', message: `auto_cycle stopped: cost ${lastCost}¢ ≥ budget ${budget}¢` },
    });
    return;
  }

  // Derive next directive from vault's next_use_case
  const vaultEntry = await db.vault.latestForBuild(buildId);
  const nextDirective = vaultEntry?.next_use_case
    ?? `Continue improving: ${build.directive}`;

  // Spawn child build
  const { buildId: childId } = await builds.start({
    directive:     nextDirective,
    autoCycle:     true,
    parentBuildId: buildId,
  });

  await db.aiol.append({
    buildId,
    kind: 'log',
    body: { level: 'info', message: `auto_cycle: spawned child build ${childId}` },
  });
}

async function countLineage(buildId: string): Promise<number> {
  let id: string | null = buildId;
  let depth = 0;
  while (id && depth < MAX_CYCLES + 1) {
    const build = await db.builds.get(id);
    id = build.parent_build_id;
    depth++;
  }
  return depth;
}
```

---

## S5.6 — `cost.server.ts`

```typescript
// Pricing constants (overridable via env for model swaps)
const PRICE_PER_1K_INPUT  = parseCents(process.env.COST_INPUT_CENTS_PER_1K  ?? '0.015');
const PRICE_PER_1K_OUTPUT = parseCents(process.env.COST_OUTPUT_CENTS_PER_1K ?? '0.060');

export async function recordCall(opts: {
  buildId:       string;
  agentId?:      string;
  model:         string;
  inputTokens:   number;
  outputTokens:  number;
}): Promise<void> {
  const cents =
    (opts.inputTokens  / 1000) * PRICE_PER_1K_INPUT +
    (opts.outputTokens / 1000) * PRICE_PER_1K_OUTPUT;

  await db.costs.insert({
    buildId:      opts.buildId,
    agentId:      opts.agentId ?? null,
    model:        opts.model,
    inputTokens:  opts.inputTokens,
    outputTokens: opts.outputTokens,
    cents,
  });

  // Update the denormalized total on builds for Realtime UI
  await db.builds.incrementCost(opts.buildId, cents);
}

export async function checkBudget(buildId: string): Promise<void> {
  const budget = parseCents(process.env.BUILD_BUDGET_CENTS ?? '100');
  const total  = await db.costs.sumByBuild(buildId);
  if (total > budget) {
    await db.builds.updateStatus(buildId, 'failed');
    throw new CapError('cycle'); // reuses CapError; cycle = "runaway" semantic
  }
}
```

**Integrate into tick loop:** After every n8n callback that returns token counts (evidence callbacks should include `{input_tokens, output_tokens}` from the AI Agent node), call `recordCall` + `checkBudget`.

**Integrate into AI adapters:** `openai.server.ts` `chat()` / `chatJSON()` functions should return `{text, usage}` where `usage = {input_tokens, output_tokens}`. Update callsites in S2/S3 accordingly.

---

## S5.7 — `components/build/CostBadge.tsx`

```tsx
// Reads build.total_cost_cents from the useBuildStream hook (already subscribed)
export function CostBadge({ build }: { build: BuildRow }) {
  if (!build.total_cost_cents) return null;
  const cents = Number(build.total_cost_cents);
  const label = cents < 1 ? `${(cents * 100).toFixed(1)}¢` : `$${(cents / 100).toFixed(3)}`;
  return <span className="cost-badge">{label}</span>;
}
```

Place in `BuildHeader` between status pill and elapsed time.

---

## S5.8 — `components/build/CycleControl.tsx`

```tsx
export function CycleControl({ build }: { build: BuildRow }) {
  const [toggling, setToggling] = useState(false);

  const toggle = async () => {
    setToggling(true);
    await builds.toggleAutoCycle({ buildId: build.id, value: !build.auto_cycle });
    setToggling(false);
  };

  return (
    <div className="cycle-control">
      <label>
        <input type="checkbox" checked={build.auto_cycle} onChange={toggle} disabled={toggling} />
        Auto-advance ({build.cycle_count}/{3} cycles)
      </label>
    </div>
  );
}
```

`builds.toggleAutoCycle` is a new owner-gated server fn that sets `builds.auto_cycle` and optionally triggers `checkAutoAdvance` if the build is already `succeeded`.

---

## S5.9 — `scripts/seed-vault.ts`

Pre-populates vault with 3 bootstrap patterns so first real builds can rerank:

```typescript
const SEEDS = [
  {
    pattern: 'Create a Markdown file with a title and body. Use a single build_files entry. No dependencies.',
    evidence: { capabilities: ['write-markdown'], file_count: 1, key_files: ['README.md'] },
    next_use_case: 'Add a second markdown file with a table of contents.',
  },
  {
    pattern: 'Create a React component file with a default export, TypeScript props interface, and Tailwind styling.',
    evidence: { capabilities: ['react-component'], file_count: 1, key_files: ['src/components/Widget.tsx'] },
    next_use_case: 'Add a Storybook story for the component.',
  },
  {
    pattern: 'Scaffold a minimal Vite + React + TypeScript project: package.json, vite.config.ts, src/main.tsx, src/App.tsx, index.html.',
    evidence: { capabilities: ['vite-scaffold'], file_count: 5, key_files: ['package.json', 'vite.config.ts'] },
    next_use_case: 'Add a Zustand store and a feature component.',
  },
];
```

For each seed: `embedText(pattern)` → `db.vault.write(...)`. Idempotent check: skip if `pattern` already in vault.

---

## S5.10 — `scripts/verify-end-to-end.ts`

The definitive "are we done" script. Nonzero exit on first failure.

| Gate | Test |
|---|---|
| 1 | `builds.start({directive:'a single file hello.md containing the text hello'})` → `build.status='succeeded'` within 60 s |
| 2 | `build_files` contains `hello.md`, `README.md`, and ≥1 vitest file |
| 3 | `vault_entries` has exactly 1 row for this build with a 768-dim embedding |
| 4 | Second build of same directive → `aiol_messages` has a `vault` row with `scope:'read'` showing reused vault hits |
| 5 | Inject a build with a deliberately broken file (missing closing brace) → `repair` fires once → `build.status='succeeded'` |
| 6 | Inject `builds.start` with `auto_cycle:true` → child build appears with `parent_build_id` pointing to first → child also succeeds |
| 7 | Set `CYCLE_BUDGET_CENTS=0` → `auto_cycle` child is blocked with log `'auto_cycle stopped: cost ... ≥ budget'` |
| 8 | Snapshot reload: close realtime mid-build; re-call `builds.snapshot`; assert returned `agents`, `files`, `messages` match DB counts |
| 9 | Close browser tab mid-build (simulate via closing channel) → reopen → `useBuildStream` hydrates correctly, build still completes |

---

## S5.11 — Verification gates

**S5 is done only when all 8 pass.**

| # | Gate | How to verify |
|---|---|---|
| G5-1 | Typecheck + ripgrep | `tsc --noEmit` exits 0; zero client leaks |
| G5-2 | Vault read path | Seed vault via `seed-vault.ts`; run a build; `aiol_messages` shows `vault` row with `scope:'read'` hits for a seeded pattern |
| G5-3 | Vault write path | After succeeded build, `vault_entries` has row with 768-dim embedding and non-null `next_use_case` |
| G5-4 | Cost tracking | After a build, `costs` table has ≥1 row; `builds.total_cost_cents > 0` |
| G5-5 | Budget guard | Set `BUILD_BUDGET_CENTS=0.001`; run a build → build transitions to `failed` with log `'cost ... ≥ budget'` |
| G5-6 | Auto-cycle fires | `builds.start({auto_cycle:true})`; after first succeeds, child build appears automatically |
| G5-7 | Cycle cap | Set env to allow; run until `cycle_count=3`; 4th cycle blocked with log message |
| G5-8 | verify-end-to-end | `bun run scripts/verify-end-to-end.ts` exits 0 (all 9 sub-gates pass) |

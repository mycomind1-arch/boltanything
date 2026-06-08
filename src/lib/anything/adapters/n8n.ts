import { signHex, verifyHex } from '../aiol/hmac';

type WorkflowSlug = 'decompose' | 'generate_files' | 'evidence_gate' | 'repair' | 'docs_and_tests' | 'vault_write' | 'vault_search_rerank';

const N8N_BASE_URL = () => import.meta.env.VITE_N8N_BASE_URL ?? '';
const N8N_WEBHOOK_SECRET = () => import.meta.env.VITE_N8N_WEBHOOK_SECRET ?? '';

export async function triggerWorkflow(slug: WorkflowSlug, payload: Record<string, unknown>, opts: { buildId: string; jobId: string }): Promise<void> {
  const body = JSON.stringify({ ...payload, build_id: opts.buildId, job_id: opts.jobId });
  const sig = await signHex(N8N_WEBHOOK_SECRET(), body);
  const res = await fetch(`${N8N_BASE_URL()}/webhook/${slug}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-anything-signature': `sha256=${sig}`, 'x-anything-build-id': opts.buildId, 'x-anything-job-id': opts.jobId },
    body,
  });
  if (!res.ok) throw new Error(`n8n ${slug} returned ${res.status}: ${await res.text()}`);
}

export async function verifyCallback(raw: string, sigHeader: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const hex = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
  const valid = await verifyHex(N8N_WEBHOOK_SECRET(), raw, hex);
  if (!valid) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}

export { signHex as signBody };

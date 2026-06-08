import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_WEBHOOK_SECRET") ?? "";
const BANNED = [/\beval\s*\(/g, /\bFunction\s*\(/g, /process\.exit/g, /process\.kill/g, /169\.254\.169\.254/g, /metadata\.google/g];

async function signHex(secret: string, raw: string): Promise<string> { const enc = new TextEncoder(); const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const buf = await crypto.subtle.sign("HMAC", key, enc.encode(raw)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function verifyHex(secret: string, raw: string, sigHex: string): Promise<boolean> { const expected = await signHex(secret, raw); if (expected.length !== sigHex.length) return false; let ok = true; for (let i = 0; i < expected.length; i++) ok = (expected.charCodeAt(i) === sigHex.charCodeAt(i)) && ok; return ok; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const raw = await req.text();
  const sig = req.headers.get("x-anything-signature") ?? "";
  const hex = sig.startsWith("sha256=") ? sig.slice(7) : sig;
  if (!await verifyHex(N8N_WEBHOOK_SECRET, raw, hex)) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const { build_id, job_id, files } = JSON.parse(raw);
  if (!build_id || !files) return new Response(JSON.stringify({ error: "missing build_id or files" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const results: Array<{ path: string; ok: boolean; issues: string[] }> = [];
  for (const file of files as Array<{ path: string; content: string }>) {
    const issues: string[] = [];
    for (const re of BANNED) { if (re.test(file.content)) issues.push(`banned: ${re.source}`); }
    const absImports = file.content.match(/from ['"][^.@][^'"]*['"]/g) ?? [];
    for (const i of absImports) issues.push(`absolute import: ${i}`);
    results.push({ path: file.path, ok: issues.length === 0, issues });
  }
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.from("aiol_messages").insert({ build_id, from_agent: "SB:static_lint", to_agent: "N8N:evidence_gate", kind: "log", body: { job_id, tool: "static_lint", results } });
  return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

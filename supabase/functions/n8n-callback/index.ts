import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_WEBHOOK_SECRET") ?? "";

async function signHex(secret: string, raw: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function verifyHex(secret: string, raw: string, sigHex: string): Promise<boolean> {
  const expected = await signHex(secret, raw);
  if (expected.length !== sigHex.length) return false;
  let ok = true;
  for (let i = 0; i < expected.length; i++) ok = (expected.charCodeAt(i) === sigHex.charCodeAt(i)) && ok;
  return ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const raw = await req.text();
  const sig = req.headers.get("x-anything-signature") ?? "";
  const hex = sig.startsWith("sha256=") ? sig.slice(7) : sig;
  if (!await verifyHex(N8N_WEBHOOK_SECRET, raw, hex)) return new Response(JSON.stringify({ error: "bad_signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
  const buildId = body.build_id as string | undefined;
  if (!buildId) return new Response(JSON.stringify({ error: "missing build_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: build } = await admin.from("builds").select("status").eq("id", buildId).single();
  if (!build || ["failed", "succeeded"].includes(build.status)) return new Response(JSON.stringify({ error: "build_terminal" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  await admin.from("aiol_messages").insert({ build_id: buildId, from_agent: (body.from as string) ?? "N8N", to_agent: (body.to as string) ?? "ORC", kind: (body.kind as string) ?? "log", body: body.body ?? body });
  const jobId = body.job_id as string | undefined;
  if (jobId) await admin.from("jobs").update({ status: "succeeded" }).eq("id", jobId);
  return new Response(JSON.stringify({ ok: true, enqueued: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

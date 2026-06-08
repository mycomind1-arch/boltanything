import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_WEBHOOK_SECRET") ?? "";

async function signHex(secret: string, raw: string): Promise<string> { const enc = new TextEncoder(); const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const buf = await crypto.subtle.sign("HMAC", key, enc.encode(raw)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function verifyHex(secret: string, raw: string, sigHex: string): Promise<boolean> { const expected = await signHex(secret, raw); if (expected.length !== sigHex.length) return false; let ok = true; for (let i = 0; i < expected.length; i++) ok = (expected.charCodeAt(i) === sigHex.charCodeAt(i)) && ok; return ok; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const raw = await req.text();
  const sig = req.headers.get("x-anything-signature") ?? "";
  const hex = sig.startsWith("sha256=") ? sig.slice(7) : sig;
  if (!await verifyHex(N8N_WEBHOOK_SECRET, raw, hex)) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const { build_id, job_id, level, message } = JSON.parse(raw);
  if (!build_id) return new Response(JSON.stringify({ error: "missing build_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.from("aiol_messages").insert({ build_id, from_agent: "N8N:tool", to_agent: "ORC:log", kind: "log", body: { job_id, level, message } });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

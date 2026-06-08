import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (secret !== CRON_SECRET) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: recycled } = await admin.rpc("recycle_stale_claims", { p_age_seconds: 90 });
    let totalDispatched = 0;
    for (let round = 0; round < 3; round++) {
      const { data: jobs } = await admin.rpc("claim_jobs", { p_limit: 5 });
      if (!jobs || jobs.length === 0) break;
      for (const job of jobs) {
        await admin.from("jobs").update({ status: "running" }).eq("id", job.id);
        if (job.agent_id) await admin.from("agents").update({ state: "running" }).eq("id", job.agent_id);
        await admin.from("aiol_messages").insert({ build_id: job.build_id, from_agent: "SYS:cron", to_agent: "SYS:dispatched", kind: "task", body: { job_id: job.id, kind: job.kind, round } });
        totalDispatched++;
      }
    }
    await admin.from("aiol_messages").insert({ build_id: null, from_agent: "SYS:cron", to_agent: "SYS:heartbeat", kind: "log", body: { recycled: recycled ?? 0, dispatched: totalDispatched, ts: new Date().toISOString() } });
    return new Response(JSON.stringify({ recycled: recycled ?? 0, dispatched: totalDispatched }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

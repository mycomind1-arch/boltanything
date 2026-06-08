import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const TICK_SECRET = Deno.env.get("INTERNAL_TICK_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (secret !== TICK_SECRET) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: jobs, error } = await admin.rpc("claim_jobs", { p_limit: 5 });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let dispatched = 0;
    for (const job of (jobs ?? [])) {
      await admin.from("jobs").update({ status: "running" }).eq("id", job.id);
      if (job.agent_id) await admin.from("agents").update({ state: "running" }).eq("id", job.agent_id);
      await admin.from("aiol_messages").insert({ build_id: job.build_id, from_agent: "ORC:tick", to_agent: "SYS:dispatched", kind: "task", body: { job_id: job.id, kind: job.kind } });
      dispatched++;
    }
    return new Response(JSON.stringify({ claimed: jobs?.length ?? 0, dispatched, failed: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

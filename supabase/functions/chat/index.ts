import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const token = authHeader.slice(7);
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const ownerEmail = Deno.env.get("OWNER_EMAIL") ?? "";
  if (user.email !== ownerEmail) return new Response("Forbidden", { status: 403, headers: corsHeaders });
  const body = await req.json();
  const directive = body.directive as string | undefined;
  if (!directive) return new Response(JSON.stringify({ error: "missing directive" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: build, error: buildError } = await admin.from("builds").insert({ owner_id: user.id, directive, status: "queued", mode: "build" }).select().single();
  if (buildError || !build) return new Response(JSON.stringify({ error: buildError?.message ?? "build_failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: spawnData, error: spawnError } = await admin.rpc("spawn_agent_with_job", { p_build_id: build.id, p_parent_id: null, p_role: "root", p_kind: "root.start", p_payload: { directive } });
  if (spawnError) return new Response(JSON.stringify({ error: spawnError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ type: "build_started", buildId: build.id, agentId: spawnData[0]?.agent_id, jobId: spawnData[0]?.job_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

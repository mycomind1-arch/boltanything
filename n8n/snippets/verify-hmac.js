const raw = JSON.stringify($json);
const sig = $headers['x-anything-signature'] ?? '';
const hex = sig.startsWith('sha256=') ? sig.slice(7) : sig;
const enc = new TextEncoder();
const key = await crypto.subtle.importKey('raw', enc.encode($env.N8N_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const out = await crypto.subtle.sign('HMAC', key, enc.encode(raw));
const expected = [...new Uint8Array(out)].map(b=>b.toString(16).padStart(2,'0')).join('');
let ok = expected.length === hex.length;
for (let i = 0; i < expected.length; i++) { ok = (expected.charCodeAt(i) === hex.charCodeAt(i)) && ok; }
if (!ok) throw new Error('bad_signature');
return $json;

const enc = new TextEncoder();

export async function signHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(raw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

export async function verifyHex(
  secret: string, raw: string, sigHex: string
): Promise<boolean> {
  const expected = await signHex(secret, raw);
  if (expected.length !== sigHex.length) return false;
  let ok = true;
  for (let i = 0; i < expected.length; i++) {
    ok = (expected.charCodeAt(i) === sigHex.charCodeAt(i)) && ok;
  }
  return ok;
}

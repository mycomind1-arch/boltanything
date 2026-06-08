export async function get(_key: string): Promise<string | null> {
  if (!import.meta.env.VITE_UPSTASH_REDIS_URL) return null;
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url: import.meta.env.VITE_UPSTASH_REDIS_URL!, token: import.meta.env.VITE_UPSTASH_REDIS_TOKEN! });
  return r.get(_key);
}

export async function setEx(_key: string, _ttl: number, _value: string): Promise<void> {
  if (!import.meta.env.VITE_UPSTASH_REDIS_URL) return;
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url: import.meta.env.VITE_UPSTASH_REDIS_URL!, token: import.meta.env.VITE_UPSTASH_REDIS_TOKEN! });
  await r.setex(_key, _ttl, _value);
}

export async function withCache<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const cached = await get(key);
  if (cached) return JSON.parse(cached) as T;
  const result = await fn();
  await setEx(key, ttl, JSON.stringify(result));
  return result;
}

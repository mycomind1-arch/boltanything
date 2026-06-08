const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL ?? '';

export function ownerGuard(email: string | undefined | null): void {
  if (!OWNER_EMAIL || email !== OWNER_EMAIL) {
    throw new Response('Forbidden', { status: 403 });
  }
}

export function isOwner(email: string | undefined | null): boolean {
  if (!OWNER_EMAIL) return false;
  return email === OWNER_EMAIL;
}

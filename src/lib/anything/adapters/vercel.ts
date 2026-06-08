export const vercel = {
  deploy: async (): Promise<never> => { throw new Error('Vercel adapter disabled in v1 — future cycle'); },
};

export const github = {
  commitTree: async (): Promise<never> => { throw new Error('GitHub adapter disabled in v1 — future cycle'); },
};

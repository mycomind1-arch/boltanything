const BANNED = [/\beval\s*\(/g, /\bFunction\s*\(/g, /process\.exit/g, /process\.kill/g, /169\.254\.169\.254/g, /metadata\.google/g];

export interface LintResult { path: string; ok: boolean; issues: string[]; }

export function staticLint(files: Array<{ path: string; content: string }>): LintResult[] {
  return files.map(file => {
    const issues: string[] = [];
    for (const re of BANNED) { if (re.test(file.content)) issues.push(`banned: ${re.source}`); }
    const absImports = file.content.match(/from ['"][^.@][^'"]*['"]/g) ?? [];
    for (const i of absImports) issues.push(`absolute import: ${i}`);
    return { path: file.path, ok: issues.length === 0, issues };
  });
}

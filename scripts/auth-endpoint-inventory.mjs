import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/api/src');
const entries = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.controller.ts')) {
      const text = fs.readFileSync(file, 'utf8');
      const prefix = text.match(/@Controller\((?:'([^']*)'|"([^"]*)")?\)/)?.slice(1).find(Boolean) ?? '';
      const controllerStart = text.indexOf('export class');
      const classPolicy = text.slice(0, controllerStart).match(/@(Public|OptionalAuth|PublicInDev|Roles|RequirePermissions|RequireAnyPermissions)\([^)]*\)/g) ?? [];
      for (const match of text.matchAll(/@(Get|Post|Patch|Put|Delete)\((?:'([^']*)'|"([^"]*)")?\)/g)) {
        const nextHandler = text.slice(match.index).search(/\n\s*(?:async\s+)?\w+\s*\(/);
        const before = text.slice(Math.max(controllerStart, text.lastIndexOf('}', match.index) + 1), match.index);
        const after = text.slice(match.index, match.index + Math.max(0, nextHandler));
        const policy = [...classPolicy, ...(before + after).match(/@(Public|OptionalAuth|PublicInDev|Roles|RequirePermissions|RequireAnyPermissions|SensitiveOperation)\([^)]*\)/g) ?? []];
        entries.push({ file: path.relative('.', file).replaceAll('\\', '/'), line: text.slice(0, match.index).split('\n').length, method: match[1].toUpperCase(), route: `/api/${[prefix, match[2] ?? match[3]].filter(Boolean).join('/')}`, policy: policy.length ? [...new Set(policy)].join(' ') : 'Global JWT/CSRF/first-login guards; verify ownership in service' });
      }
    }
  }
}
visit(root);
fs.mkdirSync('docs/security', { recursive: true });
fs.writeFileSync('docs/security/AUTH_ENDPOINT_INVENTORY.md', '# Static endpoint inventory\n\nGenerated from source decorators. This is a review index, not proof of ownership validation or runtime behavior. All API routes inherit global guards unless explicitly exempted. Multiline/dynamic decorator expressions require manual review.\n\n| Method | Route | Source | Declared policy / review requirement |\n| --- | --- | --- | --- |\n' + entries.map((e) => `| ${e.method} | \`${e.route}\` | \`${e.file}:${e.line}\` | ${e.policy.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n') + '\n');
console.log(`Inventoried ${entries.length} route declarations.`);

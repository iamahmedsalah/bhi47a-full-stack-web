import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '../../..');
function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => dependencies[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
const shared = load('packages/shared/src/constants/permissions.ts');
const { STAFF_PERMISSION_GROUPS: groups } = load('apps/web/src/features/staff/permission-groups.ts', { '@student-portal/shared': shared });

test('every delegatable permission appears exactly once, including grace marks', () => {
  const displayed = groups.flatMap((group) => group.permissions);
  assert.equal(new Set(displayed).size, displayed.length, 'duplicate permission in editor');
  assert.deepEqual([...displayed].sort(), [...shared.STAFF_ASSIGNABLE_PERMISSIONS].sort());
  assert(groups.find((group) => group.key === 'control').permissions.includes(shared.PERMISSIONS.CONTROL_GRADES_GRACE));
  assert(!displayed.includes(shared.PERMISSIONS.ADMINS_MANAGE));
  assert(!displayed.includes(shared.PERMISSIONS.DANGER_ZONE_DELETE_ALL));
});

test('all categories and permissions have readable Arabic and English labels', () => {
  for (const locale of ['ar', 'en']) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, `apps/web/src/messages/${locale}.json`), 'utf8')).staff.permissions;
    for (const group of groups) {
      assert(messages.groups[group.key], `${locale}: missing category ${group.key}`);
      for (const permission of group.permissions) {
        const label = messages.labels[permission.replaceAll('.', '_')];
        assert(label && !label.includes('???'), `${locale}: missing/corrupt label ${permission}`);
      }
    }
    for (const key of ['search', 'section', 'allSections', 'selection', 'allPermissions', 'selectedOnly', 'unselectedOnly', 'visibleCount', 'noMatches']) {
      assert(messages[key] && !messages[key].includes('???'), `${locale}: missing filter label ${key}`);
    }
  }
});

test('backend permission references use current catalog entries', () => {
  const seen = new Set();
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [, key] of source.matchAll(/\bPERMISSIONS\.([A-Z][A-Z_]+)/g)) {
          assert(key in shared.PERMISSIONS, `${file}: obsolete permission ${key}`);
          seen.add(key);
        }
      }
    }
  }
  scan(path.join(root, 'apps/api/src'));
  assert(seen.has('CONTROL_GRADES_GRACE'), 'grace permission must remain enforced in backend');
});

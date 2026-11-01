// Offline previews: dummy values only; does not connect to an email provider.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const ts = apiRequire('typescript');
const folder = path.join(root, 'apps/api/src/modules/emails/templates');
function load(name, dependency) {
  const source = fs.readFileSync(path.join(folder, `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => dependency);
  return exports;
}
const builder = load('email-template.builder');
const { buildOtpEmail, buildComplaintReplyEmail } = load('email-content', builder);
const output = path.join(root, 'outputs/email-previews');
fs.mkdirSync(output, { recursive: true });
for (const lang of ['ar', 'en']) {
  const otp = buildOtpEmail({ purpose: 'password-reset', lang, greetingName: lang === 'ar' ? 'أحمد' : 'Ahmed', otp: '012345', portalUrl: 'https://bhi47.app' });
  const complaint = buildComplaintReplyEmail({ ticketNumber: 'TKT-20261101-DEMO', lang, portalUrl: 'https://bhi47.app' });
  fs.writeFileSync(path.join(output, `otp-${lang}.html`), otp.html);
  fs.writeFileSync(path.join(output, `complaint-${lang}.html`), complaint.html);
}
console.log('Created four offline email previews in outputs/email-previews');

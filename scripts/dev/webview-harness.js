#!/usr/bin/env node
// Serve the built webview (dist/webview) in a normal browser with the same CSP and bridge script the
// extension injects, plus a mocked `acquireVsCodeApi`. Catches bundle / CSP / startup crashes
// (e.g. circular vendor chunks) without launching VS Code.
//
//   pnpm run build:client && node scripts/dev/webview-harness.js [port]
//   open http://localhost:<port>/harness.html and watch the browser console.
//
// The mock host answers the debug log API with canned data and logs every message the page posts
// (also kept in `window.__posts` for assertions).
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const webviewDir = path.join(root, 'dist', 'webview');
const port = Number(process.argv[2]) || 8767;
const nonce = 'harness-nonce';

const bridge = fs
    .readFileSync(path.join(root, 'src/utils/webview.ts'), 'utf8')
    .match(/const BRIDGE_SCRIPT = `([\s\S]*?)`;/)?.[1];
if (!bridge) throw new Error('BRIDGE_SCRIPT not found in src/utils/webview.ts');

const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none';" />`;

const mock = `<script nonce="${nonce}">
const users = [{ Id: '005000000000001AAA', Name: 'Ada Admin', Username: 'ada@example.com', TraceFlagId: null, TraceFlagActive: false, TraceFlagExpirationDate: null, TraceFlagDebugLevel: null }];
const debugLevels = [
  { Id: '7dl000000000001AAA', DeveloperName: 'SFDC_DevConsole', MasterLabel: 'SFDC Dev Console' },
  { Id: '7dl000000000002AAA', DeveloperName: 'Finest_All', MasterLabel: 'Finest All' },
];
const permEntries = [
  { section: 'object', key: 'Account', status: 'changed', left: { read: true, edit: true }, right: { read: true, delete: true }, changes: [{ perm: 'delete', left: false, right: true }, { perm: 'edit', left: true, right: false }] },
  { section: 'object', key: 'Lead', status: 'removed', left: { read: true }, changes: [] },
  { section: 'field', key: 'Account.Industry', status: 'added', right: { read: true, edit: true }, changes: [] },
  { section: 'system', key: 'ViewSetup', status: 'removed', left: { enabled: true }, changes: [] },
  { section: 'tab', key: 'standard-Lead', status: 'changed', left: { visibility: 'Available' }, right: { visibility: 'Visible' }, changes: [{ perm: 'visibility', left: 'Available', right: 'Visible' }] },
];
const summary = (section, o) => ({ section, leftCount: 1, rightCount: 1, oneSided: false, added: 0, removed: 0, changed: 0, ...o });
const answers = (endpoint, data) => {
  if (endpoint === '/api/compare/context') return { success: true, orgs: [{ username: 'ada@example.com', alias: 'dev', isDefault: true, isSandbox: false, isScratchOrg: false }], git: { available: true, refs: [{ name: 'main', kind: 'branch' }, { name: 'feature/x', kind: 'branch' }], workingTreeRef: '@working-tree' } };
  if (endpoint === '/api/compare/items') return { success: true, items: [{ id: '0PS000000000001AAA', name: 'Sales', label: 'Sales Team (Sales)', type: data.type }] };
  if (endpoint === '/api/compare/run') return { success: true, left: { name: 'Sales', type: 'permissionset' }, right: { name: 'Sales', type: 'permissionset' }, diff: { entries: permEntries, sections: [summary('object', { changed: 1, removed: 1 }), summary('field', { added: 1 }), summary('system', { removed: 1, oneSided: true }), summary('tab', { changed: 1 })] } };
  if (endpoint.startsWith('/api/users')) return { success: true, users, currentUser: { display_name: 'Ada Admin', username: 'ada@example.com' } };
  if (endpoint.startsWith('/api/debugLevels')) return { success: true, debugLevels };
  if (endpoint.startsWith('/api/debugLogs')) return { success: true, logs: { records: [] } };
  if (endpoint === '/api/traceFlags/start') return { success: true, traceFlagId: '7tf000000000001AAA' };
  return { success: true };
};
window.__posts = [];
window.acquireVsCodeApi = () => {
  let state = {};
  return {
    postMessage(message) {
      window.__posts.push(message);
      console.log('POST ' + JSON.stringify(message));
      if (message.command === 'ready') {
        setTimeout(() => window.postMessage({ command: 'setActiveComponent', component: new URLSearchParams(location.search).get('c') || 'debugLogFetcher' }, '*'), 30);
      }
      if (message.type === 'api') {
        setTimeout(() => window.postMessage({ type: 'apiResponse', id: message.id, ok: true, result: answers(message.endpoint, message.data) }, '*'), 30);
      }
    },
    getState: () => state,
    setState: (next) => { state = next; },
  };
};
</script>`;

const page = fs
    .readFileSync(path.join(webviewDir, 'index.html'), 'utf8')
    .replace(/<head[^>]*>/i, (head) => `${head}${csp}${mock}<script nonce="${nonce}">${bridge}</script>`);

const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/harness.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page);
        return;
    }
    const file = path.join(webviewDir, path.normalize(urlPath));
    if (!file.startsWith(webviewDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(
        fs.readFileSync(file),
    );
}).listen(port, () => console.log(`Harness: http://localhost:${port}/harness.html (Ctrl+C to stop)`));

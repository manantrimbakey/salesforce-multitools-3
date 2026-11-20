#!/usr/bin/env node
// Like webview-harness.js, but the page talks to the REAL extension-host router (out/rpc/routes.js) and therefore to a
// real org. Used to drive the real webview in Chrome against an org end to end.
//
//   pnpm run build:client && pnpm run compile-tests
//   node scripts/dev/webview-live-harness.js <sfdxProjectDir> [port]   (project dir = git repo with sfdx-project.json)
//   open http://localhost:<port>/harness.html?c=permissionCompare
//
// Differences from the production webview: the CSP allows `connect-src 'self'` (the page calls this local server for
// RPC, production uses postMessage), and `showSaveDialog` is stubbed to write exports into <projectDir>/.export-test.
// Binds to 127.0.0.1 only. Whatever the org allows is reachable: only point it at orgs you may query.
const fs = require('fs');
const http = require('http');
const path = require('path');

const projectDir = path.resolve(process.argv[2] || '');
const port = Number(process.argv[3]) || 8768;
if (!process.argv[2] || !fs.existsSync(projectDir)) {
    console.error('usage: node scripts/dev/webview-live-harness.js <sfdxProjectDir> [port]');
    process.exit(2);
}

const root = path.resolve(__dirname, '../..');
const webviewDir = path.join(root, 'dist', 'webview');
const nonce = 'harness-nonce';

require('./vscode-stub.js');
const stub = globalThis.__vscodeStub;
stub.workspace.workspaceFolders = [{ uri: { fsPath: projectDir } }];
const exportDir = path.join(projectDir, '.export-test');
stub.window = stub.window || {};
stub.window.showSaveDialog = async (options) => {
    fs.mkdirSync(exportDir, { recursive: true });
    const name = path.basename(options?.defaultUri?.fsPath ?? 'export.md');
    return { fsPath: path.join(exportDir, name) };
};
stub.window.showInformationMessage = async () => undefined;
stub.window.showWarningMessage = async () => undefined;
stub.window.showErrorMessage = async () => undefined;

const { apiRouter } = require(path.join(root, 'out/rpc/routes.js'));
const { RpcError } = require(path.join(root, 'out/rpc/router.js'));

const bridge = fs
    .readFileSync(path.join(root, 'src/utils/webview.ts'), 'utf8')
    .match(/const BRIDGE_SCRIPT = `([\s\S]*?)`;/)?.[1];
if (!bridge) throw new Error('BRIDGE_SCRIPT not found in src/utils/webview.ts');

const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self';" />`;
const mock = `<script nonce="${nonce}">
window.__posts = [];
window.acquireVsCodeApi = () => {
  let state = {};
  return {
    postMessage(message) {
      window.__posts.push(message);
      if (message.command === 'ready') {
        setTimeout(() => window.postMessage({ command: 'setActiveComponent', component: new URLSearchParams(location.search).get('c') || 'permissionCompare' }, '*'), 30);
      }
      if (message.type === 'api') {
        fetch('/rpc', { method: 'POST', body: JSON.stringify(message) })
          .then((r) => r.json())
          .then((reply) => window.postMessage(reply, '*'));
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

async function rpc(message) {
    try {
        const result = await apiRouter.dispatch(message.method ?? 'GET', message.endpoint, message.data);
        return { type: 'apiResponse', id: message.id, ok: true, result };
    } catch (error) {
        const known = error instanceof RpcError;
        return {
            type: 'apiResponse',
            id: message.id,
            ok: false,
            error: known ? error.message : 'Internal error',
            code: known ? error.code : 'INTERNAL_ERROR',
        };
    }
}

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (req.method === 'POST' && urlPath === '/rpc') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
            const reply = await rpc(JSON.parse(body));
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
        });
        return;
    }
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
}).listen(port, '127.0.0.1', () =>
    console.log(`Live harness: http://localhost:${port}/harness.html?c=permissionCompare`),
);

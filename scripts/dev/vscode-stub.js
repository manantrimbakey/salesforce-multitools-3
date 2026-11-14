// Minimal `vscode` module stub so the pure unit tests can run under plain Node (`--require`).
// `suite`/`test`/`setup`... are mapped onto node:test because mocha 10 does not start on Node 26.
// Not a faithful VS Code: extend it only as far as a test needs.
const Module = require('module');
const test = require('node:test');

const outputChannel = { appendLine() {}, append() {}, show() {}, dispose() {} };

globalThis.__vscodeStub ??= {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    },
    window: { createOutputChannel: () => outputChannel },
    EventEmitter: class {
        get event() {
            return () => undefined;
        }
        fire() {}
    },
    Uri: { file: (fsPath) => ({ fsPath }) },
};

// One shared instance: tests mutate it (e.g. workspaceFolders) and the code under test must see it.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
    return request === 'vscode' ? globalThis.__vscodeStub : originalLoad.call(this, request, ...rest);
};

Object.assign(globalThis, {
    suite: test.describe,
    test: test.it,
    suiteSetup: test.before,
    suiteTeardown: test.after,
    setup: test.beforeEach,
    teardown: test.afterEach,
});

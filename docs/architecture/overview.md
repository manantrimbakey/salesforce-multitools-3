[← Back to Documentation Home](../index.md)

# Salesforce Multitools - Architecture Overview

This document provides a high-level overview of the Salesforce Multitools extension architecture, explaining how the different components work together.

## Extension Architecture

Salesforce Multitools follows a modular architecture with clear separation between the backend (extension) and frontend (webview) components. The architecture is designed to be maintainable, extensible, and performant.

### Core Components

The extension consists of the following core components:

```
salesforce-multitools-3/
├── src/                     # Backend - VS Code extension code
│   ├── extension.ts         # Entry point for VS Code extension
│   ├── commands/            # Command handlers
│   ├── rpc/                 # Webview <-> extension host RPC (router, routes, attachRpc)
│   ├── services/            # Salesforce / storage services behind the RPC routes
│   ├── utils/               # Shared utilities
│   └── features/            # Feature modules
│       ├── componentFileSwitcher/    # LWC/Aura file switching
│       ├── lastModifiedDetails/      # File modification tracking
│       ├── debugLogs/                # Debug log viewer panel and provider
│       ├── permissionCompare/        # Permission compare panel and command
│       └── sidePanel/                # Sidebar webview provider
│
├── client/                  # Frontend - React UI components
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── assets/          # Static assets
│   │   └── App.tsx          # Main React app
│   └── public/
│
└── resources/               # Shared resources
```

## Key Architectural Principles

### 1. Feature Modularity

Each feature is organized as a self-contained module within the `src/features` directory. This modular approach allows for:

- Independent development of features
- Easier testing and debugging
- Simplified maintenance and updates

### 2. Separation of Concerns

The extension follows a clear separation between:

- **Backend Logic**: Implemented in TypeScript within the `src` directory
- **UI Components**: Implemented in React within the `client` directory
- **Communication Layer**: Message passing between extension and webviews

### 3. Message-Based Communication

Communication between the extension and UI components follows a message-based pattern:

```
Extension (Backend) <---> Webview (Frontend)
       │                        │
       │  postMessage() ─────►  │
       │                        │
       │  ◄───── message event  │
```

### 4. In-Process RPC (`window.callServerApi`)

Webviews fetch data through a request/response protocol layered on `postMessage`. There is no
HTTP server and no network port. Every webview HTML page gets a nonce'd bridge script injected by
`src/utils/webview.ts` that:

- acquires the VS Code API once, stores it as `window.vscodeApi` and makes later
  `acquireVsCodeApi()` calls return the same object, and
- defines `window.callServerApi(endpoint, method = 'GET', data = null)`, which resolves with the
  parsed result or rejects with an `Error` (`error.code` carries the error code).

Protocol:

```
webview -> host:  { type: 'api', id, endpoint, method, data }
host -> webview:  { type: 'apiResponse', id, ok: true,  result }
                  { type: 'apiResponse', id, ok: false, error, code }
```

`attachRpc(webview, disposables)` (`src/rpc/attachRpc.ts`) answers these messages for the sidebar
view and the debug log panel. It ignores every other message type, so existing `command` based
handlers keep working. The `Router` (`src/rpc/router.ts`) matches method plus path pattern
(`/api/debugLogs/:id/download`), validates `:id` parameters as Salesforce ids and dispatches to the
handlers in `src/rpc/routes.ts`. Handlers are thin; the work happens in services:

- `services/debugLogService.ts`: log list, users, trace flags (with selectable debug level), debug levels, method names, delete / bulk delete
- `services/logBodyClient.ts`: streams log bodies with the connection's token
- `services/logStorage.ts`: atomic on-disk cache under `.sfdx/_multi-tool/debug-logs/<org>/`
- `services/apexLogParser.ts`: pure log parsing helpers
- `services/permissionCompare/`: permission set / profile compare (org loader via SOQL, git / XML loader, normalization, semantic diff); UI in `client/src/components/permissionCompare`
- `services/workspaceFileService.ts`: workspace restricted directory listing / file open

Expected failures throw `RpcError` (message shown to the webview); unexpected errors are logged in
the extension host and returned as a generic message with code `INTERNAL_ERROR`. The webview CSP
uses `connect-src 'none'`.

## Bundling and lazy loading

`node esbuild.js` produces two bundles. `dist/extension.js` (about 50 KB) is the extension itself.
`dist/sfcore.js` (about 2 MB) holds `@salesforce/core` and jsforce and is loaded with a plain `require` the first time
an org connection is needed (`SFUtils.loadCore`), so activation stays cheap. Use `require`, not `import()`: an
`import()` of the externalised CJS file loses its named exports. The webview is built by Vite into `dist/webview`
with a single `vendor` chunk plus lazy feature chunks (react, mui and emotion must not be split into separate chunks).
See [Building](../development/building.md) and [Gotchas](../development/gotchas.md).

## Extension Activation Flow

When the extension is activated:

1. `extension.ts` is executed by VS Code
2. The logger is initialized
3. Configuration watchers are registered
4. Commands are registered via `CommandHandler`
5. Sidebar view is registered
6. Org config watching starts (the Salesforce connection is created lazily on first use)

## UI Architecture

The UI is implemented as a React application with the following structure:

- **App.tsx**: Main React component that serves as the entry point
- **Context Providers**: Provide VS Code API access to components
- **Component Structure**: Components are organized into logical units

## Communication Flow

The extension uses several communication patterns:

### 1. Command Registration

```typescript
vscode.commands.registerCommand('commandId', handlerFunction);
```

### 2. Webview Message Passing

```typescript
// From extension to webview
webview.postMessage({ command: 'commandName', data: payload });

// From webview to extension
vscode.postMessage({ command: 'commandName', data: payload });
```

### 3. Event Handling

```typescript
// In extension
vscode.workspace.onDidChangeTextDocument(handler);

// In webview
window.addEventListener('message', messageHandler);
```

## Dependency Management

The extension uses:

- **package.json**: Defines extension dependencies
- **client/package.json**: Defines UI dependencies

## Extension Context

The `vscode.ExtensionContext` is used throughout the extension to:

- Register disposables
- Store extension state
- Access extension resources
- Manage subscriptions

## Data Flow

```
┌───────────────────┐      ┌───────────────────┐
│                   │      │                   │
│   VS Code API     │◄────►│  Extension Host   │
│                   │      │                   │
└───────────────────┘      └────────┬──────────┘
                                    │
                                    ▼
                           ┌───────────────────┐
                           │                   │
                           │  Feature Modules  │
                           │                   │
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌───────────────────┐
                           │                   │
                           │  Webview (React)  │
                           │                   │
                           └───────────────────┘
```

## Salesforce Integration

The extension integrates with Salesforce through:

- `@salesforce/core` for API access
- SFDX CLI for deployment operations
- Metadata API for querying component information

## Error Handling

The extension implements robust error handling:

- All asynchronous operations use try/catch blocks
- Errors are logged via the Logger utility
- User-facing errors are displayed via VS Code notifications

## Extension Settings

The extension is configurable through VS Code settings, defined in `package.json`.

---

[← Back to Documentation Home](../index.md)

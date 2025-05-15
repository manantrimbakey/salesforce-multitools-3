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
│   ├── utils/               # Shared utilities
│   └── features/            # Feature modules
│       ├── componentFileSwitcher/    # LWC/Aura file switching
│       ├── lastModifiedDetails/      # File modification tracking
│       ├── fileSwitcher/             # General file switching
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

## Extension Activation Flow

When the extension is activated:

1. `extension.ts` is executed by VS Code
2. The logger is initialized
3. Configuration watchers are registered
4. Commands are registered via `CommandHandler`
5. Sidebar view is registered
6. Salesforce connection is initialized (if available)

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
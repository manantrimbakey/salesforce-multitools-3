# Change Log

All notable changes to the "salesforce-multitools-3" extension will be documented in this file.

## [Unreleased]

## [0.7.1]

### Fixed

- Package metadata now points at this repository: the Marketplace page, README images and issue links no longer use the old repository

### Added

- Publishing guide (`docs/development/publishing.md`) and a script that retargets Dependabot pull requests to `dev2`

### Changed

- `vsce` is installed globally instead of being a project dependency

## [0.7.0]

### Added

- Choose the debug level when starting logging for a user: pick one of the org's existing debug levels or the built-in default; the choice is remembered, and the level in use is shown for active trace flags
- Developer docs (`CLAUDE.md`, `docs/development`) and scripts for unit tests, a browser webview harness and an opt-in real-org check

### Security

- Removed the localhost Express server; webviews now talk to the extension through postMessage RPC
- Validate Salesforce ids, escape SOQL input and restrict file access to the workspace
- Nonce-based webview CSP without `unsafe-eval` and without remote images
- File browsing/opening resolves symlinks, so a link inside the workspace cannot reach files outside it

### Fixes

- Log level and auto-refresh settings now apply when changed (wrong settings namespace)
- Errors are no longer lost in the output log
- Bulk delete handles more than 2000 logs; single log delete now works
- Component switcher resolves the right folder for files in subfolders
- Custom object last-modified lookup uses the correct DeveloperName
- Default org resolution supports `target-org` (`.sf/config.json`), usernames and global config
- Bulk delete also removes the locally cached copies of the deleted logs
- Stopping logging only needs the trace flag id

### Changed

- Default debug level for new trace flags is lighter (Apex `FINE`, System `DEBUG`, the rest `INFO`) instead of everything at `FINEST`; it is created as `SF_Multitools_Debug_v2`
- The `Alt+O` / `Option+O` component switch shortcut only applies while editing a Lightning component file

### Removed

- The `Get Last Modified Info` command (`salesforce-multitools-3.getLastModifiedInfo`); use `Refresh Last Modified Info`
- The extension no longer activates on startup in every workspace; it activates only when the workspace has `.sfdx/sfdx-config.json` or `.sf/config.json`
- The separate Salesforce Multitools activity bar container (the Explorer view remains)

### Performance

- Activates only in projects with `.sfdx/sfdx-config.json` or `.sf/config.json`; `@salesforce/core` loads lazily
- One shared Salesforce connection; last-modified polling pauses while the window is unfocused (default 15s)
- Debounced component switcher refresh; virtualized and lazy-loaded webview UI
- `@salesforce/core` is built as a separate lazily loaded bundle, shrinking the extension entry bundle from about 2.1 MB to about 50 KB

## [0.6.0]

### Updated

- Added feature to start or stop logging on the user

## [0.4.1]

### Fixes

- Throttled the concurrent method name fetching
- Improved the functionality to fetch method names from the log
- Enabled storage of log in project folder itself

## [0.4.0]

### Updated

- Fixed issue where last modified details were not being refreshed correctly and performance improvements

## [0.3.0]

### Updated

- UI enhancements for the debug log fetcher

## [0.2.1]

### Updated

- Updated the readme for the extension

## [0.2.0]

### Added

- Log size filtering feature to filter debug logs above or below a specified size
- Improved performance with lazy loading for method name display using Intersection Observer

### Improved

- Enhanced UI feedback during loading and deletion operations
- Fixed memory leaks by properly handling cleanup of async operations
- Better responsive design for Debug Log table

## [0.1.0]

### Added

- Ability to delete debug logs for individual users or all users directly from the Debug Log Fetcher UI.

## []

- Initial release

# Change Log

All notable changes to the "salesforce-multitools-3" extension will be documented in this file.

## [Unreleased]

### Bug fixes

- Permission compare: after picking a permission set / group / profile you can keep typing to search; the text is no longer snapped back to the other side's pick, suggestions match anywhere in the name, and long lists and big results stay responsive while typing

## [0.10.0]

### Features

- Permission compare: when comparing permission set groups it now also compares which permission sets are in each group and which active users the group is assigned to (org sides; a branch only knows the members)

### Bug fixes

- Permission compare: after switching the org or branch of a side, the item picked on the other side could be carried over by mistake and make the compare fail; it is now only picked from the new side's own list
- Permission compare: standard and packaged permission sets (for example `force__...`) no longer show a false "could not be read" warning for record types

## [0.9.0]

### Features

- Permission compare can compare permission set groups (org or branch), and for a group shows which member permission set grants each permission
- Permission compare results can be exported as Markdown or CSV
- Permission compare shows a warning when part of a side could not be read (for example record types), instead of silently leaving it out
- Permission compare now also covers external credential principal access, connected apps and external client apps, record type visibility, the profile default app and profile page layout assignments

### Bug fixes

- Permission compare: when a permission set or profile does not exist in the chosen org or branch, the field now says so instead of failing with an unexpected error
- Permission compare: the permission set / profile field keeps what you type instead of clearing it when you click away, still suggests matching names, and picks the item when the text matches one exactly

## [0.8.0]

### Features

- Compare permission sets and profiles: org vs org, branch vs org, or branch vs branch (also tags and your uncommitted files). Org data is read with SOQL, so it is complete, unlike a CLI retrieve. Results are shown in two columns, one per side, with differences highlighted. The diff compares the permissions actually granted, ignoring ordering, formatting and implied permissions, and you can filter by permission type, kind of difference (all / added / removed / changed) and name. Open it with `Compare Permission Sets / Profiles`

## [0.7.1]

### Bug fixes

- The Marketplace page, README images and issue links now point to the right repository

## [0.7.0]

### Features

- Choose the debug level when you start logging for a user: pick one of the org's debug levels or the built-in default. Your choice is remembered, and the level in use is shown for active trace flags
- The default debug level for new trace flags is lighter, so logs are smaller and easier to read
- The `Alt+O` / `Option+O` component switch shortcut now only works while you are editing a Lightning component file
- The extension now only starts in Salesforce projects (workspaces with `.sfdx/sfdx-config.json` or `.sf/config.json`)
- Removed the `Get Last Modified Info` command (use `Refresh Last Modified Info`) and the separate activity bar container (the Explorer view stays)

### Optimizations

- Faster startup: the extension loads much less code when it starts
- Last-modified updates pause while the window is not in focus
- Smoother component switcher and a faster debug log screen

### Bug fixes

- Log level and auto-refresh settings now take effect as soon as you change them
- Errors are no longer lost in the output log
- Deleting more than 2000 logs works, and deleting a single log now works
- Deleting logs also removes their locally saved copies
- Stopping logging now works reliably
- The component switcher finds the right folder for files in subfolders
- Last-modified info for custom objects is now correct
- The default org is found correctly from `target-org`, usernames and the global config
- Improved security: input from the debug log screen is validated, and the extension can no longer open files outside your workspace

## [0.6.0]

### Features

- Start or stop logging for a user

## [0.4.1]

### Optimizations

- Method names in debug logs load faster and put less load on the org

### Bug fixes

- Method names are now read from logs more reliably

### Features

- Debug logs are saved in your project folder

## [0.4.0]

### Optimizations

- Faster last-modified updates

### Bug fixes

- Last-modified details now refresh correctly

## [0.3.0]

### Features

- Improved debug log fetcher UI

## [0.2.0]

### Features

- Filter debug logs by size (above or below a given size)

### Optimizations

- Method names load lazily, only when visible
- Better loading and deletion feedback, and a more responsive debug log table

### Bug fixes

- Fixed a memory leak

## [0.1.0]

### Features

- Delete debug logs for one user or all users from the Debug Log Fetcher

## []

- Initial release

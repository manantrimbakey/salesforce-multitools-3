# Permission compare

Command: **Salesforce Multitool: Compare Permission Sets / Profiles** (`salesforce-multitools-3.openPermissionCompare`).
Opens an editor tab with two pickers (Base, Compare to). The result is shown in two columns, one per side, so it reads
like a compare: each row is one object / field / class ..., the left column is what Base grants, the right column what
Compare-to grants. Differing permissions are highlighted, a permission the other side has but this side lacks is shown
struck out, and a side that grants nothing says "Not granted". Each side is an **org** or a **branch / tag / working tree**,
and a **permission set** or **profile**. Any pairing works: org vs org, branch vs org, branch vs branch.

## How each side is loaded

| Source       | How                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org          | SOQL on the real records, so the result is complete. A metadata retrieve only returns what the retrieved package references. A profile is the `PermissionSet` row with `IsOwnedByProfile = true`. |
| Branch / tag | `git show <ref>:<path>` of the `*.permissionset-meta.xml` / `*.profile-meta.xml` file (limited to the `sfdx-project.json` package directories). Never checks anything out.                        |
| Working tree | The files on disk, including uncommitted and untracked ones.                                                                                                                                      |

Branch sources need a git repository. When the project is not under git the Branch option is disabled.

## Permission types compared

Object (CRUD, View All, Modify All), field (read / edit), system permissions, Apex classes, Visualforce pages, custom
permissions, tab settings, app visibility, flows, external data sources, custom metadata types and custom settings.

Not compared yet: record type visibility, page layout assignments, login hours / IP ranges, external credential
principals, and the profile "default" app / record type flags. There is no complete SOQL source for them.

## Semantic diff

The diff compares what is granted, not text. Before comparing, both sides are normalized:

- order, case of API names and XML formatting are ignored
- `false` / missing are the same (all-false entries are dropped)
- implied permissions are made explicit (Edit implies Read, Modify All implies View All implies Read, field Edit implies Read)
- tab visibility vocabularies are unified (`DefaultOn` = `Visible`, `DefaultOff` = `Available`, `Hidden` = `None` = not set)
- custom metadata types and settings are keyed without the `__mdt` / `__c` suffix

Changed entries list only the permissions that differ.

## Filters

Difference kind (**All** / Added / Removed / Changed, one at a time), permission type chips, name search, and **Skip sections only one side
has** (on by default for branch-vs-org): a repository file that simply lacks a section would otherwise look like a
wall of "only in org".

## Code

`src/services/permissionCompare/` (`types`, `normalize`, `diff`, `xmlParser`, `gitSource`, `orgLoader`,
`permissionCompareService`), routes `/api/compare/{context,items,run}` in `src/rpc/routes.ts`, UI in
`client/src/components/permissionCompare/`. Refs are checked against the repository's own ref list and file paths
against the listed files before `git show`; org usernames against the authorized orgs; ids with `isSalesforceId`.

## Checking against a real org

`node scripts/dev/permission-compare-check.js <alias> <gitProjectDir> <permSetA> <permSetB>` (read-only SOQL): org vs
org differences, and that a deployed permission set's XML equals its SOQL view.

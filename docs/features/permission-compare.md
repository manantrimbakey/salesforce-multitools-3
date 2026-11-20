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

Object (CRUD, View All Records, Modify All Records, View All Fields), field (read / edit), system permissions, Apex classes, Visualforce pages, custom
permissions, tab settings, app visibility (and the profile's default app), flows, external data sources, external
credential principals, connected apps and external client apps, record type visibility (visible / default), page layout
assignments (profiles), login hours and login IP ranges (profiles), custom metadata types and custom settings.

- External credential principals are stored as `<ExternalCredential>-<Principal>` (`externalCredentialPrincipalAccesses`
  in permission set XML, `SetupEntityAccess` type `ExternalCredentialParameter` in the org). Profile metadata files do not
  contain them.
- Connected apps / external client apps are `SetupEntityAccess` rows in the org and have no element in permission set or
  profile XML, so a branch side never lists them (the "skip sections only one side has" filter hides that).
- Record type visibility, layout assignments and the default app have no SOQL table. For an org side they come from the
  Metadata API `read`. Standard profiles are read under their API name (`System Administrator` is `Admin`).

Login hours (shown as `HH:MM - HH:MM` per day, a profile without them has no restriction) and login IP ranges come from the
Metadata API `read` of the profile, like layouts. Not compared yet: category group visibility (needs Knowledge data
categories, not verifiable in the test org), profile action overrides (legacy, defined on the app since API 45), and the
profile user license / custom flags.

## Permission set groups

Pick **Set group** next to Permission set / Profile. Groups compare like any other item, org vs org, branch vs org or
branch vs branch, and each permission shows which member permission set gives it ("Granted by: ..."; the tooltip of a
permission chip lists them per permission).

| Source                      | How the group's permissions are found                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org                         | The group's calculated permissions (Salesforce keeps them, muting already applied, on a hidden `PermissionSet` row owned by the group). The member permission sets are loaded too, only to attribute each permission. The group must be `Updated`; while it is `Updating` / `Outdated` the compare says so instead of showing half-calculated data. |
| Branch / tag / working tree | `*.permissionsetgroup-meta.xml` lists members; their `*.permissionset-meta.xml` files at the same ref are merged (union) and the `*.mutingpermissionset-meta.xml` files subtract. Members that are not in the repository (standard or managed permission sets) are listed in a warning, because their access is then missing from that side.        |

Two more sections appear for groups: **Group members** (the permission sets in the group, by API name; for a branch
this is the group file's list, even for members whose file is not in the repository) and **Assigned users** (usernames
of the active users the group is assigned to, org sides only, since a branch holds no assignments; the "skip sections only
one side has" filter hides it for branch-vs-org). Usernames are compared as they are, so a sandbox user
(`name@x.com.sandbox`) and its production user differ. Past 20,000 assigned users a warning says the list is cut.

A permission a muting set removed has no "granted by". Record type visibility is not part of the calculated group row,
so for an org group it is the union of the members' record types. The Permission set list no longer shows the hidden
per-group `PermissionSet` rows.

## Warnings and errors

Parts that cannot be read never silently turn into "not granted". If the Metadata API read fails for an org side
(record types, layouts, default app), a group member cannot be loaded, or a repository file cannot be parsed, the rest
is still compared and a yellow warning above the results names what is missing. Things that make a side meaningless
(item deleted, group still updating, not a git repository, unknown ref) stop the compare with a plain message.

## Semantic diff

The diff compares what is granted, not text. Before comparing, both sides are normalized:

- order, case of API names and XML formatting are ignored
- `false` / missing are the same (all-false entries are dropped)
- implied permissions are made explicit (Edit implies Read, Modify All implies View All implies Read, field Edit implies Read, View All Fields implies Read on every field of the object)
- tab visibility vocabularies are unified (`DefaultOn` = `Visible`, `DefaultOff` = `Available`, `Hidden` = `None` = not set)
- custom metadata types and settings are keyed without the `__mdt` / `__c` suffix

Changed entries list only the permissions that differ.

## Filters

Difference kind (**All** / Added / Removed / Changed, one at a time), permission type chips (with every type showing, the first click
selects just that type, further clicks add more types, clicking a selected one removes it, and **Show all** or removing the last
one shows everything again), name search, and **Skip sections only one side
has** (on by default for branch-vs-org): a repository file that simply lacks a section would otherwise look like a
wall of "only in org".

## Export

**Export** (above the results) saves what the filters currently show as **Markdown** (one table per permission type) or
**CSV** (one row per difference: section, name, difference, what each side grants, changes). A save dialog asks where.
CSV values that start with `=`, `+`, `-` or `@` are prefixed with a quote so a spreadsheet never runs them as formulas.

## Missing permission sets

When the item you typed or the one suggested from the other side does not exist in the chosen org, branch or tag, the
field says so ("`X` does not exist in dev", "No permission set matching ..."). If it disappears after the list was loaded
(deleted or renamed), Compare reports that in plain words instead of a raw error.

## Code

`src/services/permissionCompare/` (`types`, `normalize`, `diff`, `xmlParser`, `gitSource`, `orgLoader`,
`permissionCompareService`), routes `/api/compare/{context,items,run}` in `src/rpc/routes.ts`, UI in
`client/src/components/permissionCompare/`. Refs are checked against the repository's own ref list and file paths
against the listed files before `git show`; org usernames against the authorized orgs; ids with `isSalesforceId`.

## Checking against a real org

`node scripts/dev/permission-compare-check.js <alias> <gitProjectDir> <permSetA> <permSetB>` (read-only SOQL): org vs
org differences, and that a deployed permission set's XML equals its SOQL view.

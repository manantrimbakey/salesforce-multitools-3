#!/usr/bin/env node
// Opt-in end-to-end check of permission compare against a REAL org (read-only: SOQL only, nothing is written).
//
//   pnpm run compile-tests
//   node scripts/dev/permission-compare-check.js <orgAlias> <sfdxProjectDir> <permSetA> <permSetB>
//
// <sfdxProjectDir> must be a git repo holding the retrieved/deployed XML of both permission sets.
// Checks: (1) org vs org finds real differences, (2) working tree (XML) vs the same set in the org (SOQL)
// has NO difference, i.e. the semantic diff sees through formatting and CLI-retrieve vs SOQL shape.
const assert = require('assert');
const path = require('path');

const [alias, projectDir, nameA, nameB] = process.argv.slice(2);
if (!alias || !projectDir || !nameA || !nameB) {
    console.error('usage: node scripts/dev/permission-compare-check.js <orgAlias> <projectDir> <permSetA> <permSetB>');
    process.exit(2);
}

require('./vscode-stub.js');
globalThis.__vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: path.resolve(projectDir) } }];

const { PermissionCompareService: Service } = require(
    path.resolve(__dirname, '../../out/services/permissionCompare/permissionCompareService.js'),
);

const summarize = (diff) =>
    diff.entries.map(
        (e) =>
            `${e.status[0]} ${e.section}:${e.key}${e.changes.map((c) => ` [${c.perm} ${c.left}->${c.right}]`).join('')}`,
    );

(async () => {
    const context = await Service.getContext();
    const org = context.orgs.find((o) => o.alias === alias || o.username === alias);
    assert.ok(org, `org ${alias} not found among ${context.orgs.map((o) => o.alias ?? o.username)}`);
    console.log(
        `context: ${context.orgs.length} org(s), git available: ${context.git.available}, refs: ${context.git.refs.length}`,
    );

    const source = { kind: 'org', username: org.username };
    const items = await Service.listItems(source, 'permissionset');
    const pick = (name) => {
        const item = items.find((i) => i.name === name);
        assert.ok(item, `permission set ${name} not found in org`);
        return { source, item: { type: 'permissionset', id: item.id } };
    };
    console.log(
        `org lists ${items.length} permission sets; profiles: ${(await Service.listItems(source, 'profile')).length}`,
    );

    const a = pick(nameA);
    const b = pick(nameB);

    const orgVsOrg = await Service.compare(a, b);
    console.log('\norg A vs org B:');
    summarize(orgVsOrg.diff).forEach((line) => console.log('  ' + line));
    assert.ok(orgVsOrg.diff.entries.length > 0, 'A and B should differ');

    const same = await Service.compare(a, a);
    assert.strictEqual(same.diff.entries.length, 0, 'a permission set must equal itself');

    if (context.git.available) {
        const wt = { kind: 'branch', ref: context.git.workingTreeRef };
        const files = await Service.listItems(wt, 'permissionset');
        for (const [name, side] of [
            [nameA, a],
            [nameB, b],
        ]) {
            const file = files.find((f) => f.name === name);
            assert.ok(file, `${name} XML not found in working tree`);
            const xmlVsOrg = await Service.compare({ source: wt, item: { type: 'permissionset', id: file.id } }, side);
            console.log(`\nworking-tree XML vs org (${name}), expected empty:`);
            summarize(xmlVsOrg.diff).forEach((line) => console.log('  ' + line));
            assert.strictEqual(xmlVsOrg.diff.entries.length, 0, 'XML and SOQL views of one permission set must match');
        }
    }

    // Profiles: same code path (PermissionSet row owned by the profile); just prove it loads and diffs
    const profiles = await Service.listItems(source, 'profile');
    if (profiles.length >= 2) {
        const t0 = Date.now();
        const p = (item) => ({ source, item: { type: 'profile', id: item.id } });
        const result = await Service.compare(p(profiles[0]), p(profiles[1]));
        console.log(
            `\nprofile "${profiles[0].name}" vs "${profiles[1].name}": ${result.diff.entries.length} differences in ${Date.now() - t0} ms`,
        );
    }
    console.log('\nOK');
})().catch((error) => {
    console.error('FAILED:', error);
    process.exit(1);
});

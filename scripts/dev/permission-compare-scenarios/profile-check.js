// Profiles Cx_Prof_A/B (tabs, layouts, default app, record type, VAF), tab None vs absent (Cx_G01), CMT-only (Cx_G02).
// Prints the diffs for eyeballing; the expected result is in the README. ONLY org 4rst.
require('../vscode-stub.js');
const projectDir = require('path').resolve(process.argv[2] || '');
if (!process.argv[2]) {
    console.error('usage: node profile-check.js <sfdxProjectDir>');
    process.exit(2);
}
globalThis.__vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: projectDir } }];
const {
    PermissionCompareService: Svc,
} = require('../../../out/services/permissionCompare/permissionCompareService.js');
const show = (r) => {
    if (r.left.warnings?.length || r.right.warnings?.length)
        console.log('  WARN', JSON.stringify([r.left.warnings, r.right.warnings]));
    r.diff.entries.forEach((e) =>
        console.log(
            '  ' +
                e.status[0] +
                ' ' +
                e.section +
                ':' +
                e.key +
                ' L' +
                JSON.stringify(e.left || {}) +
                ' R' +
                JSON.stringify(e.right || {}),
        ),
    );
};
(async () => {
    const ctx = await Svc.getContext();
    const org = ctx.orgs.find((o) => o.alias === '4rst');
    const src = { kind: 'org', username: org.username };
    const wt = { kind: 'branch', ref: ctx.git.workingTreeRef };
    const prof = await Svc.listItems(src, 'profile');
    const ps = await Svc.listItems(src, 'permissionset');
    const pf = await Svc.listItems(wt, 'profile');
    const P = (n) => ({ source: src, item: { type: 'profile', id: prof.find((i) => i.name === n).id } });
    const O = (n) => ({ source: src, item: { type: 'permissionset', id: ps.find((i) => i.name === n).id } });
    console.log('PROFILE A vs B (org)');
    show(await Svc.compare(P('Cx_Prof_A'), P('Cx_Prof_B')));
    console.log('PROFILE B vs A (swap)');
    show(await Svc.compare(P('Cx_Prof_B'), P('Cx_Prof_A')));
    console.log('PROFILE self');
    console.log('  entries', (await Svc.compare(P('Cx_Prof_A'), P('Cx_Prof_A'))).diff.entries.length);
    console.log('G01 tab None vs absent');
    show(await Svc.compare(O('Cx_G01_A'), O('Cx_G01_B')));
    console.log('G02 CMT-only');
    show(await Svc.compare(O('Cx_G02_A'), O('Cx_G02_B')));
    console.log('profile XML (working tree) vs org, A');
    const files = pf.map((i) => i.name);
    console.log(
        '  xml profiles listed:',
        files.filter((n) => n.startsWith('Cx_')),
    );
    const xa = pf.find((i) => i.name === 'Cx_Prof_A');
    const r = await Svc.compare({ source: wt, item: { type: 'profile', id: xa.id } }, P('Cx_Prof_A'));
    show(r);
})().catch((e) => {
    console.error('FATAL', e.message);
    process.exit(2);
});

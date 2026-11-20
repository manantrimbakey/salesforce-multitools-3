// Permission set groups with conflicting members and a muting set: expected diffs and XML-merge vs org parity.
// ONLY the user's test org 4rst is used (hard-coded). Needs: pnpm run compile-tests, seeded org data (see README.md).
const assert = require('assert');
require('../vscode-stub.js');
const projectDir = require('path').resolve(process.argv[2] || '');
if (!process.argv[2]) {
    console.error('usage: node group-check.js <sfdxProjectDir that is a git repo holding the seeded XML>');
    process.exit(2);
}
globalThis.__vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: projectDir } }];
const {
    PermissionCompareService: Svc,
} = require('../../../out/services/permissionCompare/permissionCompareService.js');
const tup = (d) =>
    [
        ...new Set(
            d.entries.flatMap((e) => {
                const L = e.left || {},
                    R = e.right || {};
                return [...new Set([...Object.keys(L), ...Object.keys(R)])]
                    .filter((p) => !!L[p] !== !!R[p])
                    .map((p) => `${e.section}:${e.key}:${p}:${!!L[p]}>${!!R[p]}`);
            }),
        ),
    ].sort();
(async () => {
    const ctx = await Svc.getContext();
    const org = ctx.orgs.find((o) => o.alias === '4rst');
    const src = { kind: 'org', username: org.username };
    const wt = { kind: 'branch', ref: ctx.git.workingTreeRef };
    const g = await Svc.listItems(src, 'permissionsetgroup');
    const gf = await Svc.listItems(wt, 'permissionsetgroup');
    const O = (n) => ({ source: src, item: { type: 'permissionsetgroup', id: g.find((i) => i.name === n).id } });
    const F = (n) => ({ source: wt, item: { type: 'permissionsetgroup', id: gf.find((i) => i.name === n).id } });
    let bad = 0;
    const chk = (name, got, want) => {
        const ok = JSON.stringify(got) === JSON.stringify(want.sort());
        if (!ok) bad++;
        console.log((ok ? 'PASS ' : 'FAIL ') + name);
        if (!ok) {
            console.log('  got ', got);
            console.log('  want', want);
        }
    };
    const strip = (t) => t.filter((x) => !x.startsWith('groupMember:'));
    for (const [a, b, want] of [
        [
            'Cx_Grp1',
            'Cx_Grp2',
            [
                'object:Account:viewAllFields:true>false',
                'object:Cx_Obj1__c:read:true>false',
                'object:Cx_Obj1__c:edit:true>false',
                'object:Cx_Obj1__c:viewAll:true>false',
                'field:Account.Industry:read:true>false',
                'field:Account.Industry:edit:true>false',
                'field:Cx_Obj1__c.Cx_F1__c:read:true>false',
                'field:Cx_Obj1__c.Cx_F1__c:edit:true>false',
            ],
        ],
        [
            'Cx_Grp1',
            'Cx_Grp3',
            [
                'object:Cx_Obj1__c:edit:true>false',
                'object:Account:viewAllFields:true>false',
                'field:Account.Industry:edit:true>false',
            ],
        ],
    ]) {
        const r = await Svc.compare(O(a), O(b));
        chk(`${a} vs ${b}`, strip(tup(r.diff)), want);
        if (r.left.warnings?.length || r.right.warnings?.length)
            console.log('  warnings', r.left.warnings, r.right.warnings);
    }
    for (const n of ['Cx_Grp1', 'Cx_Grp2', 'Cx_Grp3']) {
        const r = await Svc.compare(F(n), O(n));
        chk(`${n} XML(merge) vs org`, strip(tup(r.diff)), []);
        if (r.diff.entries.length)
            console.log(JSON.stringify(r.diff.entries.filter((e) => e.section !== 'groupMember').slice(0, 6)));
    }
    process.exit(bad ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(2);
});

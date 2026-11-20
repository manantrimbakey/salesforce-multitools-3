// Randomized permission sets (seeded by gen.py) compared on org 4rst against an independent oracle, plus swap symmetry, self-compare and XML-vs-org parity.
// ONLY the user's test org 4rst is used (hard-coded). Needs: pnpm run compile-tests, seeded org data (see README.md).
const assert = require('assert');
require('../vscode-stub.js');
const projectDir = require('path').resolve(process.argv[2] || '');
if (!process.argv[2]) {
    console.error('usage: node fuzz-check.js <sfdxProjectDir that is a git repo holding the seeded XML>');
    process.exit(2);
}
globalThis.__vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: projectDir } }];
const {
    PermissionCompareService: Svc,
} = require('../../../out/services/permissionCompare/permissionCompareService.js');
const specs = require('./specs.json');
const FLAGS = ['create', 'read', 'edit', 'delete', 'viewAll', 'modifyAll', 'viewAllFields'];
const close = (f) => {
    f = { ...f };
    if (f.modifyAll) {
        f.viewAll = f.edit = f.delete = true;
    }
    if (f.delete) f.edit = true;
    if (['create', 'edit', 'delete', 'viewAll', 'viewAllFields', 'modifyAll'].some((k) => f[k])) f.read = true;
    return f;
};
// ---- independent oracle: tuples "section:key:perm:l>r"
function oracle(a, b) {
    const out = new Set();
    const oa = {},
        ob = {};
    for (const [o, f] of Object.entries(a.objects)) oa[o] = close(f);
    for (const [o, f] of Object.entries(b.objects)) ob[o] = close(f);
    for (const o of new Set([...Object.keys(oa), ...Object.keys(ob)]))
        for (const k of FLAGS) {
            const l = !!oa[o]?.[k],
                r = !!ob[o]?.[k];
            if (l !== r) out.add(`object:${o}:${k}:${l}>${r}`);
        }
    const vafOf = (sp, o) => !!close(sp.objects[o] || {}).viewAllFields;
    // listed field entry survives unless it is read-only on an object with View All Fields
    const entry = (sp, key) => {
        const x = sp.fields[key];
        if (!x) return null;
        const p = { read: !!(x.read || x.edit), edit: !!x.edit };
        if (!p.read) return null;
        const o = key.split('.')[0];
        return vafOf(sp, o) && !p.edit ? null : p;
    };
    const keys = new Set(
        [...Object.keys(a.fields), ...Object.keys(b.fields)].filter((k) => entry(a, k) || entry(b, k)),
    );
    for (const key of keys) {
        const o = key.split('.')[0];
        const side = (sp) =>
            entry(sp, key) || (vafOf(sp, o) ? { read: true, edit: false } : { read: false, edit: false });
        const l = side(a),
            r = side(b);
        for (const k of ['read', 'edit']) if (l[k] !== r[k]) out.add(`field:${key}:${k}:${l[k]}>${r[k]}`);
    }
    return out;
}
const tuples = (d) => {
    const out = new Set();
    for (const e of d.entries) {
        const L = e.left || {},
            R = e.right || {};
        const names = new Set([...Object.keys(L), ...Object.keys(R)]);
        for (const p of names) {
            const l = !!L[p],
                r = !!R[p];
            if (l !== r) out.add(`${e.section}:${e.key}:${p}:${l}>${r}`);
        }
    }
    return out;
};
const flip = (t) =>
    new Set(
        [...t].map((x) => {
            const m = x.match(/^(.*):(true|false)>(true|false)$/);
            return `${m[1]}:${m[3]}>${m[2]}`;
        }),
    );
const eq = (x, y) => x.size === y.size && [...x].every((v) => y.has(v));
(async () => {
    const ctx = await Svc.getContext();
    const org = ctx.orgs.find((o) => o.alias === '4rst');
    assert.ok(org, '4rst required');
    const src = { kind: 'org', username: org.username };
    const wt = { kind: 'branch', ref: ctx.git.workingTreeRef };
    const ps = await Svc.listItems(src, 'permissionset');
    const files = await Svc.listItems(wt, 'permissionset');
    const O = (n) => ({ source: src, item: { type: 'permissionset', id: ps.find((i) => i.name === n).id } });
    const F = (n) => ({ source: wt, item: { type: 'permissionset', id: files.find((i) => i.name === n).id } });
    let pass = 0,
        fail = [];
    const ok = (c, m) => (c ? pass++ : fail.push(m));
    const pairs = [...new Set(Object.keys(specs).map((n) => n.replace(/_[AB]$/, '')))];
    for (const p of pairs) {
        const a = specs[p + '_A'],
            b = specs[p + '_B'];
        const ab = tuples((await Svc.compare(O(p + '_A'), O(p + '_B'))).diff),
            ba = tuples((await Svc.compare(O(p + '_B'), O(p + '_A'))).diff);
        const exp = oracle(a, b);
        ok(
            eq(ab, exp),
            `${p}: oracle mismatch\n   missing(actual lacks): ${[...exp].filter((x) => !ab.has(x)).slice(0, 6)}\n   extra(actual has): ${[...ab].filter((x) => !exp.has(x)).slice(0, 6)}`,
        );
        ok(eq(ba, flip(ab)), `${p}: swap not symmetric`);
        for (const n of [p + '_A', p + '_B']) {
            ok((await Svc.compare(O(n), O(n))).diff.entries.length === 0, `${n}: self-compare not empty`);
            const w = await Svc.compare(F(n), O(n));
            ok(
                w.diff.entries.length === 0,
                `${n}: XML vs org differ: ${JSON.stringify(w.diff.entries.slice(0, 3).map((e) => e.section + ':' + e.key))}`,
            );
        }
        console.log(`${p}: ${exp.size} expected tuples, ${ab.size} actual`);
    }
    console.log(`\nPASS ${pass}  FAIL ${fail.length}`);
    fail.forEach((f) => console.log(' ✗ ' + f));
    process.exit(fail.length ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(2);
});

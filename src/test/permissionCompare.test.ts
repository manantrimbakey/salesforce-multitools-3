import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RpcError } from '../rpc/router';
import { parseSide, parseSource } from '../rpc/routes';
import { diffPermissionModels } from '../services/permissionCompare/diff';
import {
    assertKnownRef,
    findRepositoryRoot,
    listBranchItems,
    listRefs,
    loadBranchModel,
} from '../services/permissionCompare/gitSource';
import { loadOrgModel, listOrgItems } from '../services/permissionCompare/orgLoader';
import type { QueryConnection } from '../services/permissionCompare/orgLoader';
import { emptySections, WORKING_TREE_REF } from '../services/permissionCompare/types';
import type { PermissionModel } from '../services/permissionCompare/types';
import { parsePermissionXml } from '../services/permissionCompare/xmlParser';

function model(sections: Partial<PermissionModel['sections']>, name = 'X'): PermissionModel {
    return { type: 'permissionset', name, sections: { ...emptySections(), ...sections } };
}

suite('permission compare: semantic diff', () => {
    test('identical permissions written in a different order and case produce no diff', () => {
        const a = model({
            object: [
                { key: 'Account', perms: { read: true, edit: true } },
                { key: 'Contact', perms: { read: true } },
            ],
        });
        const b = model({
            object: [
                { key: 'contact', perms: { read: true } },
                { key: 'Account', perms: { edit: true, read: true } },
            ],
        });
        assert.deepStrictEqual(diffPermissionModels(a, b).entries, []);
    });

    test('explicit false flags and all-false entries equal "not granted"', () => {
        const a = model({
            field: [{ key: 'Account.Name', perms: { read: false, edit: false } }],
            apexClass: [{ key: 'Foo', perms: { enabled: false } }],
        });
        assert.deepStrictEqual(diffPermissionModels(a, model({})).entries, []);
    });

    test('implied permissions are equal to explicit ones', () => {
        const explicit = model({
            object: [{ key: 'Account', perms: { read: true, edit: true, viewAll: true, modifyAll: true } }],
            field: [{ key: 'Account.Name', perms: { read: true, edit: true } }],
        });
        const implied = model({
            object: [{ key: 'Account', perms: { modifyAll: true, edit: true } }],
            field: [{ key: 'Account.Name', perms: { edit: true } }],
        });
        assert.deepStrictEqual(diffPermissionModels(explicit, implied).entries, []);
    });

    test('tab visibility vocabularies of profiles and permission sets match; hidden equals absent', () => {
        const profile = model({
            tab: [
                { key: 'standard-Account', perms: { visibility: 'DefaultOn' } },
                { key: 'standard-Lead', perms: { visibility: 'DefaultOff' } },
                { key: 'standard-Case', perms: { visibility: 'Hidden' } },
            ],
        });
        const permset = model({
            tab: [
                { key: 'standard-Account', perms: { visibility: 'Visible' } },
                { key: 'standard-Lead', perms: { visibility: 'Available' } },
                { key: 'standard-Case', perms: { visibility: 'None' } },
            ],
        });
        assert.deepStrictEqual(diffPermissionModels(profile, permset).entries, []);
    });

    test('reports added, removed and changed with only the permissions that differ', () => {
        const left = model({
            object: [
                { key: 'Account', perms: { read: true, edit: true } },
                { key: 'Lead', perms: { read: true } },
            ],
            system: [{ key: 'ViewSetup', perms: { enabled: true } }],
        });
        const right = model({
            object: [
                { key: 'Account', perms: { read: true, delete: true } },
                { key: 'Case', perms: { read: true } },
            ],
        });
        const { entries, sections } = diffPermissionModels(left, right);
        const byKey = Object.fromEntries(entries.map((entry) => [`${entry.section}:${entry.key}`, entry]));

        assert.strictEqual(byKey['object:Lead'].status, 'removed');
        assert.strictEqual(byKey['object:Case'].status, 'added');
        assert.strictEqual(byKey['system:ViewSetup'].status, 'removed');
        assert.strictEqual(byKey['object:Account'].status, 'changed');
        assert.deepStrictEqual(
            byKey['object:Account'].changes.map((change) => [change.perm, change.left, change.right]),
            [
                ['delete', false, true],
                ['edit', true, false],
            ],
        );

        const objectSummary = sections.find((summary) => summary.section === 'object')!;
        assert.deepStrictEqual([objectSummary.added, objectSummary.removed, objectSummary.changed], [1, 1, 1]);
        assert.strictEqual(sections.find((summary) => summary.section === 'system')!.oneSided, true);
        assert.strictEqual(objectSummary.oneSided, false);
    });
});

const PERMSET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <classAccesses><apexClass>Foo</apexClass><enabled>true</enabled></classAccesses>
    <fieldPermissions><editable>true</editable><field>Account.Name</field><readable>true</readable></fieldPermissions>
    <label>Sales</label>
    <objectPermissions>
        <allowCreate>true</allowCreate><allowDelete>false</allowDelete><allowEdit>true</allowEdit>
        <allowRead>true</allowRead><modifyAllRecords>false</modifyAllRecords><object>Account</object>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>
    <pageAccesses><apexPage>Pg</apexPage><enabled>true</enabled></pageAccesses>
    <tabSettings><tab>standard-Account</tab><visibility>Visible</visibility></tabSettings>
    <userPermissions><enabled>true</enabled><name>ViewSetup</name></userPermissions>
    <customPermissions><enabled>true</enabled><name>Cp</name></customPermissions>
    <flowAccesses><enabled>true</enabled><flow>My_Flow</flow></flowAccesses>
    <applicationVisibilities><application>standard__Sales</application><visible>true</visible></applicationVisibilities>
    <externalDataSourceAccesses><enabled>true</enabled><externalDataSource>Ext</externalDataSource></externalDataSourceAccesses>
    <customMetadataTypeAccesses><enabled>true</enabled><name>ns__Cfg__mdt</name></customMetadataTypeAccesses>
    <customSettingAccesses><enabled>true</enabled><name>Setting__c</name></customSettingAccesses>
</PermissionSet>`;

suite('permission compare: xml parser', () => {
    test('parses every section, including a single occurrence of each tag', () => {
        const parsed = parsePermissionXml(PERMSET_XML, 'permissionset', 'Sales');
        assert.deepStrictEqual(parsed.sections.object, [
            {
                key: 'Account',
                perms: { create: true, read: true, edit: true, delete: false, viewAll: false, modifyAll: false },
            },
        ]);
        assert.deepStrictEqual(parsed.sections.field, [{ key: 'Account.Name', perms: { read: true, edit: true } }]);
        assert.deepStrictEqual(parsed.sections.system, [{ key: 'ViewSetup', perms: { enabled: true } }]);
        assert.deepStrictEqual(parsed.sections.apexClass, [{ key: 'Foo', perms: { enabled: true } }]);
        assert.deepStrictEqual(parsed.sections.vfPage, [{ key: 'Pg', perms: { enabled: true } }]);
        assert.deepStrictEqual(parsed.sections.customPermission, [{ key: 'Cp', perms: { enabled: true } }]);
        assert.deepStrictEqual(parsed.sections.tab, [{ key: 'standard-Account', perms: { visibility: 'Visible' } }]);
        assert.deepStrictEqual(parsed.sections.flow, [{ key: 'My_Flow', perms: { enabled: true } }]);
        assert.deepStrictEqual(parsed.sections.application, [{ key: 'standard__Sales', perms: { visible: true } }]);
        assert.deepStrictEqual(parsed.sections.externalDataSource, [{ key: 'Ext', perms: { enabled: true } }]);
        assert.deepStrictEqual(parsed.sections.customEntity, [
            { key: 'ns__Cfg', perms: { enabled: true } },
            { key: 'Setting', perms: { enabled: true } },
        ]);
    });

    test('profiles use tabVisibilities', () => {
        const xml = `<Profile><tabVisibilities><tab>standard-Lead</tab><visibility>DefaultOn</visibility></tabVisibilities></Profile>`;
        assert.deepStrictEqual(parsePermissionXml(xml, 'profile', 'P').sections.tab, [
            { key: 'standard-Lead', perms: { visibility: 'DefaultOn' } },
        ]);
    });

    test('rejects a document of the wrong kind', () => {
        assert.throws(() => parsePermissionXml('<Profile/>', 'permissionset', 'x'), /PermissionSet/);
        assert.throws(() => parsePermissionXml('not xml', 'profile', 'x'), /Profile/);
    });

    test('formatting differences do not matter: re-indented XML equals the original', () => {
        const compact = PERMSET_XML.replace(/>\s+</g, '><');
        const a = parsePermissionXml(PERMSET_XML, 'permissionset', 'Sales');
        const b = parsePermissionXml(compact, 'permissionset', 'Sales');
        assert.deepStrictEqual(diffPermissionModels(a, b).entries, []);
    });
});

function git(cwd: string, ...args: string[]): void {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
}

suite('permission compare: git source', () => {
    let repo: string;

    suiteSetup(() => {
        repo = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-compare-'));
        git(repo, 'init', '-q', '-b', 'main');
        git(repo, 'config', 'user.email', 't@example.com');
        git(repo, 'config', 'user.name', 't');
        git(repo, 'config', 'commit.gpgsign', 'false');
        const dir = path.join(repo, 'force-app', 'main', 'default', 'permissionsets');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(repo, 'sfdx-project.json'),
            JSON.stringify({ packageDirectories: [{ path: 'force-app' }] }),
        );
        fs.writeFileSync(path.join(dir, 'Sales.permissionset-meta.xml'), PERMSET_XML);
        // outside the package directories: must not be listed
        fs.mkdirSync(path.join(repo, 'other'));
        fs.writeFileSync(path.join(repo, 'other', 'Hidden.permissionset-meta.xml'), PERMSET_XML);
        git(repo, 'add', '-A');
        git(repo, 'commit', '-q', '-m', 'one');
        git(repo, 'checkout', '-q', '-b', 'feature');
        fs.writeFileSync(
            path.join(dir, 'Sales.permissionset-meta.xml'),
            PERMSET_XML.replace('<allowDelete>false', '<allowDelete>true'),
        );
        git(repo, 'commit', '-q', '-am', 'two');
        git(repo, 'checkout', '-q', 'main');
    });

    suiteTeardown(() => fs.rmSync(repo, { recursive: true, force: true }));

    test('detects repositories and non-repositories', async () => {
        assert.strictEqual(await findRepositoryRoot(repo), fs.realpathSync(repo));
        const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-compare-plain-'));
        try {
            assert.strictEqual(await findRepositoryRoot(plain), undefined);
        } finally {
            fs.rmSync(plain, { recursive: true, force: true });
        }
    });

    test('lists branches, limits files to package directories and compares two branches', async () => {
        const root = await findRepositoryRoot(repo);
        assert.ok(root);
        const refs = (await listRefs(root)).map((ref) => ref.name);
        assert.deepStrictEqual(refs.sort(), ['feature', 'main']);

        const items = await listBranchItems(root, repo, 'main', 'permissionset');
        assert.deepStrictEqual(
            items.map((item) => item.name),
            ['Sales'],
        );

        const main = await loadBranchModel(root, repo, 'main', items[0]);
        const feature = await loadBranchModel(root, repo, 'feature', items[0]);
        const { entries } = diffPermissionModels(main, feature);
        assert.deepStrictEqual(
            entries.map((entry) => [entry.section, entry.key, entry.status, entry.changes[0]?.perm]),
            [['object', 'Account', 'changed', 'delete']],
        );
    });

    test('working tree ref reads uncommitted files', async () => {
        const root = (await findRepositoryRoot(repo))!;
        const file = path.join(repo, 'force-app', 'main', 'default', 'permissionsets', 'Sales.permissionset-meta.xml');
        const original = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(
            file,
            original.replace('<enabled>true</enabled><name>ViewSetup', '<enabled>false</enabled><name>ViewSetup'),
        );
        try {
            const [item] = await listBranchItems(root, repo, WORKING_TREE_REF, 'permissionset');
            const wt = await loadBranchModel(root, repo, WORKING_TREE_REF, item);
            const head = await loadBranchModel(root, repo, 'main', item);
            const { entries } = diffPermissionModels(head, wt);
            assert.deepStrictEqual(
                entries.map((entry) => [entry.key, entry.status]),
                [['ViewSetup', 'removed']],
            );
        } finally {
            fs.writeFileSync(file, original);
        }
    });

    test('rejects unknown refs, option-like refs and paths outside the listed files', async () => {
        const root = (await findRepositoryRoot(repo))!;
        await assert.rejects(assertKnownRef(root, '--output=/tmp/x'), /Unknown branch or tag/);
        await assert.rejects(assertKnownRef(root, 'main:../../etc/passwd'), /Unknown branch or tag/);
        await assert.rejects(
            loadBranchModel(root, repo, 'main', { type: 'permissionset', id: '../../etc/passwd' }),
            /File not found/,
        );
        await assert.rejects(
            loadBranchModel(root, repo, 'main', { type: 'permissionset', id: 'other/Hidden.permissionset-meta.xml' }),
            /File not found/,
        );
    });
});

const PS_ID = '0PS000000000001AAA';
const CLASS_ID = '01p000000000001AAA';
const FLOW_ID = '300000000000001AAA';
const APP_ID = '02u000000000001AAA';
const ENTITY_ID = '01I000000000001AAA';
const SETTING_ID = '01I000000000002AAA';

function fakeConnection(): { connection: QueryConnection; queries: string[] } {
    const queries: string[] = [];
    const rows = (records: unknown[]) => Promise.resolve({ records });
    const connection: QueryConnection = {
        tooling: {
            query: <T>(soql: string) => {
                queries.push(soql);
                return Promise.resolve({
                    records: [{ Id: SETTING_ID, DeveloperName: 'Setting', NamespacePrefix: null }],
                }) as Promise<{ records: T[] }>;
            },
        },
        describe: async () => ({
            fields: [
                { name: 'Id', type: 'id' },
                { name: 'PermissionsViewSetup', type: 'boolean' },
                { name: 'PermissionsModifyAllData', type: 'boolean' },
                { name: 'Label', type: 'string' },
            ],
        }),
        query: <T>(soql: string) => {
            queries.push(soql);
            if (soql.includes('IsOwnedByProfile, Profile.Name')) {
                return rows([{ Id: PS_ID, Name: 'Sales', IsOwnedByProfile: false, Profile: null }]) as Promise<{
                    records: T[];
                }>;
            }
            if (soql.includes('PermissionsViewSetup')) {
                return rows([{ PermissionsViewSetup: true, PermissionsModifyAllData: false }]) as Promise<{
                    records: T[];
                }>;
            }
            if (soql.includes('FROM ObjectPermissions')) {
                return rows([
                    {
                        SobjectType: 'Account',
                        PermissionsCreate: true,
                        PermissionsRead: true,
                        PermissionsEdit: true,
                        PermissionsDelete: false,
                        PermissionsViewAllRecords: false,
                        PermissionsModifyAllRecords: false,
                    },
                ]) as Promise<{ records: T[] }>;
            }
            if (soql.includes('FROM FieldPermissions')) {
                return rows([{ Field: 'Account.Name', PermissionsRead: true, PermissionsEdit: true }]) as Promise<{
                    records: T[];
                }>;
            }
            if (soql.includes('FROM PermissionSetTabSetting')) {
                return rows([{ Name: 'standard-Account', Visibility: 'Visible' }]) as Promise<{ records: T[] }>;
            }
            if (soql.includes('FROM SetupEntityAccess')) {
                return rows([
                    { SetupEntityId: CLASS_ID, SetupEntityType: 'ApexClass' },
                    { SetupEntityId: FLOW_ID, SetupEntityType: 'FlowDefinition' },
                    { SetupEntityId: APP_ID, SetupEntityType: 'TabSet' },
                    { SetupEntityId: ENTITY_ID, SetupEntityType: 'CustomEntityDefinition' },
                    { SetupEntityId: SETTING_ID, SetupEntityType: 'CustomEntityDefinition' },
                ]) as Promise<{ records: T[] }>;
            }
            if (soql.includes('FROM FlowDefinitionView')) {
                return rows([{ Id: FLOW_ID, ApiName: 'My_Flow', NamespacePrefix: null }]) as Promise<{
                    records: T[];
                }>;
            }
            if (soql.includes('FROM AppMenuItem')) {
                return rows([{ ApplicationId: APP_ID, Name: 'Sales', NamespacePrefix: 'standard' }]) as Promise<{
                    records: T[];
                }>;
            }
            if (soql.includes('FROM EntityDefinition')) {
                // hides the custom setting, like the real API does
                return rows([{ DurableId: ENTITY_ID, QualifiedApiName: 'ns__Cfg__mdt' }]) as Promise<{
                    records: T[];
                }>;
            }
            if (soql.includes('FROM ApexClass')) {
                return rows([{ Id: CLASS_ID, Name: 'Foo', NamespacePrefix: 'ns' }]) as Promise<{ records: T[] }>;
            }
            return rows([]) as Promise<{ records: T[] }>;
        },
    };
    return { connection, queries };
}

suite('permission compare: org loader', () => {
    test('builds the full model from SOQL rows and matches the equivalent XML', async () => {
        const { connection } = fakeConnection();
        const org = await loadOrgModel(connection, { type: 'permissionset', id: PS_ID });
        assert.strictEqual(org.name, 'Sales');
        assert.deepStrictEqual(org.sections.system, [{ key: 'ViewSetup', perms: { enabled: true } }]);
        assert.deepStrictEqual(org.sections.apexClass, [{ key: 'ns__Foo', perms: { enabled: true } }]);

        assert.deepStrictEqual(org.sections.flow, [{ key: 'My_Flow', perms: { enabled: true } }]);
        assert.deepStrictEqual(org.sections.application, [{ key: 'standard__Sales', perms: { visible: true } }]);
        assert.deepStrictEqual(org.sections.customEntity.map((entry) => entry.key).sort(), ['Setting', 'ns__Cfg']);

        const xml = PERMSET_XML.replace('<apexClass>Foo', '<apexClass>ns__Foo')
            .replace(/<externalDataSourceAccesses>.*?<\/externalDataSourceAccesses>/s, '')
            .replace(/<pageAccesses>.*?<\/pageAccesses>/s, '')
            .replace(/<customPermissions>.*?<\/customPermissions>/s, '');
        const branch = parsePermissionXml(xml, 'permissionset', 'Sales');
        assert.deepStrictEqual(diffPermissionModels(branch, org).entries, []);
    });

    test('only issues queries scoped to the validated id', async () => {
        const { connection, queries } = fakeConnection();
        await loadOrgModel(connection, { type: 'permissionset', id: PS_ID });
        assert.ok(queries.length >= 6);
        for (const soql of queries.filter((q) => q.includes('ParentId') || q.includes('WHERE Id ='))) {
            assert.ok(soql.includes(`'${PS_ID}'`), soql);
        }
        await assert.rejects(
            loadOrgModel(connection, { type: 'permissionset', id: "0PS' OR Name != '" }),
            /Invalid permission set id/,
        );
    });

    test('lists profiles by profile name and permission sets by label', async () => {
        const connection: QueryConnection = {
            tooling: { query: () => Promise.resolve({ records: [] }) },
            describe: async () => ({ fields: [] }),
            query: <T>(soql: string) =>
                Promise.resolve({
                    records: soql.includes('IsOwnedByProfile = true')
                        ? [{ Id: PS_ID, Profile: { Name: 'System Administrator' } }]
                        : [{ Id: PS_ID, Name: 'Sales', Label: 'Sales Team' }],
                }) as Promise<{ records: T[] }>,
        };
        assert.deepStrictEqual(await listOrgItems(connection, 'profile'), [
            { id: PS_ID, name: 'System Administrator', label: 'System Administrator', type: 'profile' },
        ]);
        assert.deepStrictEqual(await listOrgItems(connection, 'permissionset'), [
            { id: PS_ID, name: 'Sales', label: 'Sales Team (Sales)', type: 'permissionset' },
        ]);
    });
});

suite('permission compare: route validation', () => {
    function badRequest(fn: () => unknown): void {
        assert.throws(fn, (error: unknown) => error instanceof RpcError && error.code === 'BAD_REQUEST');
    }

    test('source must be an org with a username or a branch with a ref', () => {
        assert.deepStrictEqual(parseSource({ kind: 'org', username: 'a@b.com' }), { kind: 'org', username: 'a@b.com' });
        assert.deepStrictEqual(parseSource({ kind: 'branch', ref: 'main' }), { kind: 'branch', ref: 'main' });
        badRequest(() => parseSource(null));
        badRequest(() => parseSource({ kind: 'ftp' }));
        badRequest(() => parseSource({ kind: 'org' }));
        badRequest(() => parseSource({ kind: 'org', username: 42 }));
        badRequest(() => parseSource({ kind: 'branch', ref: '' }));
        badRequest(() => parseSource({ kind: 'branch', ref: 'a\0b' }));
        badRequest(() => parseSource({ kind: 'branch', ref: 'x'.repeat(300) }));
    });

    test('org items need a Salesforce id, branch items a path; type is checked', () => {
        const org = { kind: 'org', username: 'a@b.com' };
        const branch = { kind: 'branch', ref: 'main' };
        assert.ok(parseSide({ source: org, item: { type: 'profile', id: PS_ID } }));
        assert.ok(
            parseSide({ source: branch, item: { type: 'permissionset', id: 'force-app/x.permissionset-meta.xml' } }),
        );
        badRequest(() => parseSide({ source: org, item: { type: 'profile', id: "x' OR 1=1" } }));
        badRequest(() => parseSide({ source: org, item: { type: 'role', id: PS_ID } }));
        badRequest(() => parseSide({ source: branch, item: { type: 'profile' } }));
        badRequest(() => parseSide({ source: branch }));
        badRequest(() => parseSide(undefined));
    });
});

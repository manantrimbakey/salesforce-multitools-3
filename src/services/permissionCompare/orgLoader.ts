import { isSalesforceId, soqlEscape } from '../../utils/validation';
import { stripCustomEntitySuffix } from './xmlParser';
import type { PermissionItemOption, PermissionItemRef, PermissionModel } from './types';
import { emptySections } from './types';

/** The part of a jsforce / `@salesforce/core` connection this loader needs (keeps it easy to fake in tests). */
export interface QueryConnection {
    query<T>(soql: string, options?: { autoFetch?: boolean; maxFetch?: number }): PromiseLike<{ records: T[] }>;
    tooling: { query<T>(soql: string): PromiseLike<{ records: T[] }> };
    describe(sobject: string): Promise<{ fields: Array<{ name: string; type: string }> }>;
}

const MAX_FETCH = 200_000;
const ID_CHUNK = 150;
const SYSTEM_FIELD_CHUNK = 80;

const SETUP_ENTITY_TYPES = [
    'ApexClass',
    'ApexPage',
    'CustomPermission',
    'FlowDefinition',
    'TabSet',
    'ExternalDataSource',
    'CustomEntityDefinition',
] as const;

type Row = Record<string, unknown>;

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function bool(value: unknown): boolean {
    return value === true;
}

function all<T>(connection: QueryConnection, soql: string): Promise<T[]> {
    return Promise.resolve(connection.query<T>(soql, { autoFetch: true, maxFetch: MAX_FETCH })).then(
        (result) => result.records,
    );
}

function assertId(id: string): string {
    if (!isSalesforceId(id)) {
        throw new Error('Invalid permission set id');
    }
    return soqlEscape(id);
}

/** Permission sets (not owned by a profile) or profiles of an org, as picker options. */
export async function listOrgItems(
    connection: QueryConnection,
    type: PermissionItemRef['type'],
): Promise<PermissionItemOption[]> {
    if (type === 'profile') {
        const rows = await all<{ Id: string; Profile: { Name: string } | null }>(
            connection,
            'SELECT Id, Profile.Name FROM PermissionSet WHERE IsOwnedByProfile = true ORDER BY Profile.Name',
        );
        return rows
            .filter((row) => row.Profile?.Name)
            .map((row) => ({ id: row.Id, name: row.Profile!.Name, label: row.Profile!.Name, type }));
    }
    const rows = await all<{ Id: string; Name: string; Label: string }>(
        connection,
        'SELECT Id, Name, Label FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label',
    );
    return rows.map((row) => ({
        id: row.Id,
        name: row.Name,
        label: row.Label && row.Label !== row.Name ? `${row.Label} (${row.Name})` : row.Name,
        type,
    }));
}

/**
 * Load the FULL permissions of a permission set / profile straight from the org with SOQL.
 *
 * A metadata retrieve only returns what the retrieved package references, so profiles and permission sets come back
 * incomplete. The underlying records (ObjectPermissions, FieldPermissions, SetupEntityAccess ...) are complete.
 * A profile is the PermissionSet row that is owned by it (`IsOwnedByProfile`), so one code path serves both.
 */
export async function loadOrgModel(connection: QueryConnection, item: PermissionItemRef): Promise<PermissionModel> {
    const id = assertId(item.id);

    // System permissions are the boolean `Permissions*` columns of the PermissionSet row itself
    const describe = await connection.describe('PermissionSet');
    const systemFields = describe.fields
        .filter((field) => field.type === 'boolean' && field.name.startsWith('Permissions'))
        .map((field) => field.name);

    const [header, objects, fields, tabs, setupAccess] = await Promise.all([
        connection.query<Row>(
            `SELECT Id, Name, Label, IsOwnedByProfile, Profile.Name FROM PermissionSet WHERE Id = '${id}'`,
        ),
        all<Row>(
            connection,
            'SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, ' +
                `PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId = '${id}'`,
        ),
        all<Row>(
            connection,
            `SELECT Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId = '${id}'`,
        ),
        all<Row>(connection, `SELECT Name, Visibility FROM PermissionSetTabSetting WHERE ParentId = '${id}'`),
        all<Row>(
            connection,
            'SELECT SetupEntityId, SetupEntityType FROM SetupEntityAccess ' +
                `WHERE ParentId = '${id}' AND SetupEntityType IN (${SETUP_ENTITY_TYPES.map((t) => `'${t}'`).join(', ')})`,
        ),
    ]);

    const row = header.records[0];
    if (!row) {
        throw new Error(`Permission set or profile not found in the org: ${item.id}`);
    }
    const systemValues = await loadSystemPermissions(connection, id, systemFields);

    const sections = emptySections();
    const profileName = str((row.Profile as Row | null)?.Name);
    const isProfile = bool(row.IsOwnedByProfile);
    const name = isProfile ? profileName : str(row.Name);

    for (const field of systemFields) {
        if (systemValues[field]) {
            sections.system.push({ key: field.slice('Permissions'.length), perms: { enabled: true } });
        }
    }

    for (const record of objects) {
        sections.object.push({
            key: str(record.SobjectType),
            perms: {
                create: bool(record.PermissionsCreate),
                read: bool(record.PermissionsRead),
                edit: bool(record.PermissionsEdit),
                delete: bool(record.PermissionsDelete),
                viewAll: bool(record.PermissionsViewAllRecords),
                modifyAll: bool(record.PermissionsModifyAllRecords),
            },
        });
    }

    for (const record of fields) {
        sections.field.push({
            key: str(record.Field),
            perms: { read: bool(record.PermissionsRead), edit: bool(record.PermissionsEdit) },
        });
    }

    for (const record of tabs) {
        sections.tab.push({ key: str(record.Name), perms: { visibility: str(record.Visibility) } });
    }

    const idsByType = new Map<string, string[]>();
    for (const record of setupAccess) {
        const entityId = str(record.SetupEntityId);
        const type = str(record.SetupEntityType);
        if (isSalesforceId(entityId)) {
            idsByType.set(type, [...(idsByType.get(type) ?? []), entityId]);
        }
    }
    const resolved = await Promise.all(
        RESOLVERS.map(async (resolver) => ({
            resolver,
            keys: await resolveNames(connection, resolver, idsByType.get(resolver.setupEntityType) ?? []),
        })),
    );
    for (const { resolver, keys } of resolved) {
        sections[resolver.section].push(...keys.map((key) => ({ key, perms: { [resolver.perm]: true } })));
    }

    return { type: isProfile ? 'profile' : 'permissionset', name, sections };
}

/** The `Permissions*` columns, queried in chunks so the (GET) SOQL URL stays well under the length limit. */
async function loadSystemPermissions(
    connection: QueryConnection,
    id: string,
    fields: string[],
): Promise<Record<string, boolean>> {
    const values: Record<string, boolean> = {};
    for (let start = 0; start < fields.length; start += SYSTEM_FIELD_CHUNK) {
        const chunk = fields.slice(start, start + SYSTEM_FIELD_CHUNK);
        const result = await connection.query<Row>(`SELECT ${chunk.join(', ')} FROM PermissionSet WHERE Id = '${id}'`);
        for (const field of chunk) {
            values[field] = bool(result.records[0]?.[field]);
        }
    }
    return values;
}

interface Resolver {
    setupEntityType: (typeof SETUP_ENTITY_TYPES)[number];
    section:
        | 'apexClass'
        | 'vfPage'
        | 'customPermission'
        | 'flow'
        | 'application'
        | 'externalDataSource'
        | 'customEntity';
    perm: 'enabled' | 'visible';
    sobject: string;
    idField: string;
    nameField: string;
    /** `NamespacePrefix` exists on the object; names become `ns__Name` */
    namespaced: boolean;
}

/** How each SetupEntityAccess entity id is turned back into the API name used in metadata files. */
const RESOLVERS: Resolver[] = [
    {
        setupEntityType: 'ApexClass',
        section: 'apexClass',
        perm: 'enabled',
        sobject: 'ApexClass',
        idField: 'Id',
        nameField: 'Name',
        namespaced: true,
    },
    {
        setupEntityType: 'ApexPage',
        section: 'vfPage',
        perm: 'enabled',
        sobject: 'ApexPage',
        idField: 'Id',
        nameField: 'Name',
        namespaced: true,
    },
    {
        setupEntityType: 'CustomPermission',
        section: 'customPermission',
        perm: 'enabled',
        sobject: 'CustomPermission',
        idField: 'Id',
        nameField: 'DeveloperName',
        namespaced: true,
    },
    {
        setupEntityType: 'FlowDefinition',
        section: 'flow',
        perm: 'enabled',
        sobject: 'FlowDefinitionView',
        idField: 'Id',
        nameField: 'ApiName',
        namespaced: true,
    },
    {
        setupEntityType: 'TabSet',
        section: 'application',
        perm: 'visible',
        sobject: 'AppMenuItem',
        idField: 'ApplicationId',
        nameField: 'Name',
        namespaced: true,
    },
    {
        setupEntityType: 'ExternalDataSource',
        section: 'externalDataSource',
        perm: 'enabled',
        sobject: 'ExternalDataSource',
        idField: 'Id',
        nameField: 'DeveloperName',
        namespaced: true,
    },
    {
        setupEntityType: 'CustomEntityDefinition',
        section: 'customEntity',
        perm: 'enabled',
        sobject: 'EntityDefinition',
        idField: 'DurableId',
        nameField: 'QualifiedApiName',
        namespaced: false,
    },
];

function joinNamespace(namespace: string, base: string): string {
    return namespace ? `${namespace}__${base}` : base;
}

/** Resolve record ids to API names (`ns__Name` for managed components), in chunks to keep the SOQL short. */
async function resolveNames(connection: QueryConnection, resolver: Resolver, ids: string[]): Promise<string[]> {
    const names: string[] = [];
    const resolvedIds = new Set<string>();
    for (let start = 0; start < ids.length; start += ID_CHUNK) {
        const list = ids
            .slice(start, start + ID_CHUNK)
            .map((value) => `'${soqlEscape(value)}'`)
            .join(', ');
        const namespace = resolver.namespaced ? ', NamespacePrefix' : '';
        const rows = await all<Row>(
            connection,
            `SELECT ${resolver.idField}, ${resolver.nameField}${namespace} FROM ${resolver.sobject} WHERE ${resolver.idField} IN (${list})`,
        );
        for (const row of rows) {
            const base = str(row[resolver.nameField]);
            if (base) {
                resolvedIds.add(str(row[resolver.idField]).slice(0, 15));
                names.push(resolver.namespaced ? joinNamespace(str(row.NamespacePrefix), base) : base);
            }
        }
    }

    if (resolver.section === 'customEntity') {
        // EntityDefinition hides some custom settings; the Tooling CustomObject record knows every one of them
        const missing = ids.filter((id) => !resolvedIds.has(id.slice(0, 15)));
        for (let start = 0; start < missing.length; start += ID_CHUNK) {
            const list = missing
                .slice(start, start + ID_CHUNK)
                .map((value) => `'${soqlEscape(value)}'`)
                .join(', ');
            const result = await connection.tooling.query<Row>(
                `SELECT Id, DeveloperName, NamespacePrefix FROM CustomObject WHERE Id IN (${list})`,
            );
            for (const row of result.records) {
                names.push(joinNamespace(str(row.NamespacePrefix), str(row.DeveloperName)));
            }
        }
        return names.map(stripCustomEntitySuffix);
    }
    return names;
}

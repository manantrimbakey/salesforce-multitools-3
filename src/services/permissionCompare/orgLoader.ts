import { isSalesforceId, soqlEscape } from '../../utils/validation';
import { attributeSources } from './permissionGroup';
import type { GroupComponent } from './permissionGroup';
import { readMetadataOnlySections, stripCustomEntitySuffix } from './xmlParser';
import type { PermissionItemOption, PermissionItemRef, PermissionModel } from './types';
import { emptySections } from './types';

/** The part of a jsforce / `@salesforce/core` connection this loader needs (keeps it easy to fake in tests). */
export interface QueryConnection {
    query<T>(soql: string, options?: { autoFetch?: boolean; maxFetch?: number }): PromiseLike<{ records: T[] }>;
    tooling: { query<T>(soql: string): PromiseLike<{ records: T[] }> };
    describe(sobject: string): Promise<{ fields: Array<{ name: string; type: string }> }>;
    /** Metadata API; optional so SOQL-only fakes still work. Needed for parts SOQL cannot return. */
    metadata?: { read(type: string, fullName: string): PromiseLike<unknown> };
}

/** Standard profiles are listed by label in SOQL but are named differently in the Metadata API. */
const STANDARD_PROFILE_NAMES: Record<string, string> = {
    'System Administrator': 'Admin',
    'Standard User': 'Standard',
    'Read Only': 'ReadOnly',
    'Solution Manager': 'SolutionManager',
    'Marketing User': 'MarketingProfile',
    'Contract Manager': 'ContractManager',
    'Standard Platform User': 'StandardAul',
};

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
    'ExternalCredentialParameter',
    'ConnectedApplication',
    'ExternalClientApplication',
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
    if (type === 'permissionsetgroup') {
        const groups = await all<{ Id: string; DeveloperName: string; MasterLabel: string }>(
            connection,
            'SELECT Id, DeveloperName, MasterLabel FROM PermissionSetGroup ORDER BY MasterLabel',
        );
        return groups.map((row) => ({
            id: row.Id,
            name: row.DeveloperName,
            label:
                row.MasterLabel && row.MasterLabel !== row.DeveloperName
                    ? `${row.MasterLabel} (${row.DeveloperName})`
                    : row.DeveloperName,
            type,
        }));
    }
    // The PermissionSet row every group owns is not a real permission set; groups are listed on their own
    const rows = await all<{ Id: string; Name: string; Label: string }>(
        connection,
        'SELECT Id, Name, Label FROM PermissionSet WHERE IsOwnedByProfile = false AND PermissionSetGroupId = null ORDER BY Label',
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
export async function loadOrgModel(
    connection: QueryConnection,
    item: PermissionItemRef,
    options: { readMetadata?: boolean } = {},
): Promise<PermissionModel> {
    if (item.type === 'permissionsetgroup') {
        return loadOrgGroup(connection, item);
    }
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
        throw new Error(
            'This permission set or profile no longer exists in the org (it may have been deleted or renamed). Reload the list and pick it again.',
        );
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

    const warning =
        options.readMetadata === false
            ? undefined
            : await loadMetadataOnlySections(connection, isProfile, isProfile ? profileName : str(row.Name), sections);

    return {
        type: isProfile ? 'profile' : 'permissionset',
        name,
        sections,
        ...(warning ? { warnings: [warning] } : {}),
    };
}

/**
 * Record type visibility, page layout assignments and the default app of a profile have no SOQL table; the Metadata
 * API `read` returns them (the rest of that result is incomplete for profiles, which is why SOQL is used above).
 */
async function loadMetadataOnlySections(
    connection: QueryConnection,
    isProfile: boolean,
    name: string,
    sections: PermissionModel['sections'],
): Promise<string | undefined> {
    if (!connection.metadata || !name) {
        return undefined;
    }
    const kind = isProfile ? 'profile' : 'permission set';
    const missing = `Record type visibility${isProfile ? ', page layout assignments and the default app' : ''} of the ${kind} "${name}" could not be read from the org, so they are missing from this side`;
    const candidates = isProfile
        ? [STANDARD_PROFILE_NAMES[name], name, encodeURIComponent(name)].filter((value): value is string => !!value)
        : [name];
    let failure = '';
    for (const fullName of candidates) {
        try {
            const result = await connection.metadata.read(isProfile ? 'Profile' : 'PermissionSet', fullName);
            const node = Array.isArray(result) ? result[0] : result;
            if (typeof node === 'object' && node !== null && 'fullName' in node) {
                readMetadataOnlySections(node as Record<string, unknown>, sections);
                const apps = (node as { applicationVisibilities?: unknown }).applicationVisibilities;
                for (const app of Array.isArray(apps) ? apps : apps ? [apps] : []) {
                    const entry = app as { application?: string; default?: boolean | string };
                    if (entry.application && String(entry.default) === 'true') {
                        sections.application.push({ key: entry.application, perms: { default: true } });
                    }
                }
                return undefined;
            }
        } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
        }
    }
    // Not fatal: everything SOQL returns is still correct, but the user must know part of the picture is absent
    return failure ? `${missing} (${failure}).` : `${missing} (the Metadata API did not return it).`;
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
        | 'externalCredentialPrincipal'
        | 'connectedApp'
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
        setupEntityType: 'ConnectedApplication',
        section: 'connectedApp',
        perm: 'enabled',
        sobject: 'ConnectedApplication',
        idField: 'Id',
        nameField: 'Name',
        namespaced: false,
    },
    {
        setupEntityType: 'ExternalClientApplication',
        section: 'connectedApp',
        perm: 'enabled',
        sobject: 'ExternalClientApplication',
        idField: 'Id',
        nameField: 'DeveloperName',
        namespaced: false,
    },
    {
        // Tooling API object; the entity id is a principal parameter (`0pu...`) of an external credential
        setupEntityType: 'ExternalCredentialParameter',
        section: 'externalCredentialPrincipal',
        perm: 'enabled',
        sobject: 'ExternalCredentialParameter',
        idField: 'Id',
        nameField: 'ParameterName',
        namespaced: false,
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
    if (resolver.section === 'externalCredentialPrincipal') {
        return resolvePrincipalNames(connection, ids);
    }
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

/**
 * External credential principals: `<ExternalCredential API name>-<principal name>`, the key used by the
 * `externalCredentialPrincipal` element of permission set metadata. Only Tooling API can read the parameters.
 * Parameters of other types (auth protocol variant, headers ...) are not principals and are skipped.
 */
async function resolvePrincipalNames(connection: QueryConnection, ids: string[]): Promise<string[]> {
    const names: string[] = [];
    for (let start = 0; start < ids.length; start += ID_CHUNK) {
        const list = ids
            .slice(start, start + ID_CHUNK)
            .map((value) => `'${soqlEscape(value)}'`)
            .join(', ');
        const result = await connection.tooling.query<Row>(
            'SELECT ParameterName, ExternalCredential.DeveloperName FROM ExternalCredentialParameter ' +
                `WHERE Id IN (${list}) AND ParameterType IN ('NamedPrincipal', 'PerUserPrincipal')`,
        );
        for (const row of result.records) {
            const credential = str((row.ExternalCredential as Row | null)?.DeveloperName);
            const principal = str(row.ParameterName);
            if (credential && principal) {
                names.push(`${credential}-${principal}`);
            }
        }
    }
    return names;
}

const GROUP_MEMBER_CONCURRENCY = 3;

/**
 * A permission set group. Salesforce keeps the calculated (muting already applied) permissions on a hidden
 * `PermissionSet` row owned by the group, so the same SOQL loader reads them. The member permission sets are loaded
 * separately to say which of them grants each permission, and to supply what only the Metadata API returns
 * (record type visibility is not calculated into that row).
 */
async function loadOrgGroup(connection: QueryConnection, item: PermissionItemRef): Promise<PermissionModel> {
    const id = assertId(item.id);
    const groups = await connection.query<Row>(
        `SELECT Id, DeveloperName, MasterLabel, Status FROM PermissionSetGroup WHERE Id = '${id}'`,
    );
    const group = groups.records[0];
    if (!group) {
        throw new Error(
            'This permission set group no longer exists in the org (it may have been deleted or renamed). Reload the list and pick it again.',
        );
    }
    const label = str(group.MasterLabel) || str(group.DeveloperName);
    if (str(group.Status) !== 'Updated') {
        throw new Error(
            `The permission set group "${label}" is ${str(group.Status).toLowerCase() || 'not calculated'} in the org, so its permissions are not final. Try again once Salesforce has finished updating it.`,
        );
    }

    const [owned, members] = await Promise.all([
        connection.query<Row>(`SELECT Id FROM PermissionSet WHERE PermissionSetGroupId = '${id}'`),
        all<Row>(
            connection,
            'SELECT PermissionSetId, PermissionSet.Name, PermissionSet.Label FROM PermissionSetGroupComponent ' +
                `WHERE PermissionSetGroupId = '${id}'`,
        ),
    ]);
    const calculatedId = str(owned.records[0]?.Id);
    if (!isSalesforceId(calculatedId)) {
        throw new Error(`The permission set group "${label}" has no calculated permissions yet.`);
    }
    const calculated = await loadOrgModel(
        connection,
        { type: 'permissionset', id: calculatedId },
        { readMetadata: false },
    );

    // Muting permission sets have no PermissionSet row (their name is null); only real members are loaded
    const real = members
        .map((row) => ({
            id: str(row.PermissionSetId),
            name: str((row.PermissionSet as Row | null)?.Label) || str((row.PermissionSet as Row | null)?.Name),
        }))
        .filter((member) => member.name && isSalesforceId(member.id));
    const components: GroupComponent[] = [];
    const warnings: string[] = [...(calculated.warnings ?? [])];
    for (let start = 0; start < real.length; start += GROUP_MEMBER_CONCURRENCY) {
        const batch = real.slice(start, start + GROUP_MEMBER_CONCURRENCY);
        const loaded = await Promise.all(
            batch.map(async (member) => {
                try {
                    return {
                        name: member.name,
                        model: await loadOrgModel(connection, { type: 'permissionset', id: member.id }),
                    };
                } catch (error) {
                    // The calculated row is still right; only the "granted by" for this member is lost
                    const reason = error instanceof Error ? error.message : String(error);
                    warnings.push(
                        `Member "${member.name}" could not be loaded, so it is not shown as a source (${reason}).`,
                    );
                    return undefined;
                }
            }),
        );
        components.push(...loaded.filter((component): component is GroupComponent => !!component));
    }
    for (const component of components) {
        warnings.push(...(component.model.warnings ?? []));
    }

    // Record types (and anything else only the Metadata API knows) are not part of the calculated row
    for (const component of components) {
        calculated.sections.recordType.push(...component.model.sections.recordType);
    }
    const attributed = attributeSources({ ...calculated, type: 'permissionsetgroup', name: label }, components);
    return warnings.length > 0 ? { ...attributed, warnings: [...new Set(warnings)] } : attributed;
}

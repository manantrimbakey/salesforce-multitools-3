import { XMLParser } from 'fast-xml-parser';
import type { PermissionEntry, PermissionItemType, PermissionModel } from './types';
import { emptySections } from './types';

/** Tags that can appear once or many times; forced to arrays so a single occurrence is not a bare object. */
const ARRAY_TAGS = new Set([
    'objectPermissions',
    'fieldPermissions',
    'userPermissions',
    'classAccesses',
    'pageAccesses',
    'customPermissions',
    'tabSettings',
    'tabVisibilities',
    'applicationVisibilities',
    'flowAccesses',
    'externalDataSourceAccesses',
    'customMetadataTypeAccesses',
    'customSettingAccesses',
]);

const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false, // keep "true" / "false" as text, never coerce names like "123"
    trimValues: true,
    isArray: (name) => ARRAY_TAGS.has(name),
});

type XmlNode = Record<string, unknown>;

function asNodes(value: unknown): XmlNode[] {
    return Array.isArray(value)
        ? value.filter((node): node is XmlNode => typeof node === 'object' && node !== null)
        : [];
}

function text(node: XmlNode, tag: string): string | undefined {
    const value = node[tag];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function flag(node: XmlNode, tag: string): boolean {
    return text(node, tag)?.toLowerCase() === 'true';
}

/**
 * Parse a `*.permissionset-meta.xml` / `*.profile-meta.xml` document into the shared permission model.
 * @throws Error when the document is not a PermissionSet / Profile
 */
export function parsePermissionXml(xml: string, type: PermissionItemType, name: string): PermissionModel {
    const root = parser.parse(xml) as Record<string, unknown>;
    const rootTag = type === 'profile' ? 'Profile' : 'PermissionSet';
    const doc = root[rootTag];
    if (typeof doc !== 'object' || doc === null) {
        throw new Error(`Not a valid ${rootTag} metadata file`);
    }
    const node = doc as XmlNode;
    const sections = emptySections();

    for (const item of asNodes(node.objectPermissions)) {
        const key = text(item, 'object');
        if (key) {
            sections.object.push({
                key,
                perms: {
                    create: flag(item, 'allowCreate'),
                    read: flag(item, 'allowRead'),
                    edit: flag(item, 'allowEdit'),
                    delete: flag(item, 'allowDelete'),
                    viewAll: flag(item, 'viewAllRecords'),
                    modifyAll: flag(item, 'modifyAllRecords'),
                },
            });
        }
    }

    for (const item of asNodes(node.fieldPermissions)) {
        const key = text(item, 'field');
        if (key) {
            sections.field.push({ key, perms: { read: flag(item, 'readable'), edit: flag(item, 'editable') } });
        }
    }

    for (const item of asNodes(node.userPermissions)) {
        const key = text(item, 'name');
        if (key) {
            sections.system.push({ key, perms: { enabled: flag(item, 'enabled') } });
        }
    }

    pushEnabled(sections.apexClass, asNodes(node.classAccesses), 'apexClass');
    pushEnabled(sections.vfPage, asNodes(node.pageAccesses), 'apexPage');
    pushEnabled(sections.customPermission, asNodes(node.customPermissions), 'name');

    pushEnabled(sections.flow, asNodes(node.flowAccesses), 'flow');
    pushEnabled(sections.externalDataSource, asNodes(node.externalDataSourceAccesses), 'externalDataSource');
    // Custom metadata types (`__mdt`) and custom settings (`__c`) share one section, keyed without the suffix
    for (const item of [...asNodes(node.customMetadataTypeAccesses), ...asNodes(node.customSettingAccesses)]) {
        const key = text(item, 'name');
        if (key) {
            sections.customEntity.push({
                key: stripCustomEntitySuffix(key),
                perms: { enabled: flag(item, 'enabled') },
            });
        }
    }
    for (const item of asNodes(node.applicationVisibilities)) {
        const key = text(item, 'application');
        if (key) {
            sections.application.push({ key, perms: { visible: flag(item, 'visible') } });
        }
    }

    // Permission sets call it tabSettings, profiles tabVisibilities
    for (const item of [...asNodes(node.tabSettings), ...asNodes(node.tabVisibilities)]) {
        const key = text(item, 'tab');
        const visibility = text(item, 'visibility');
        if (key && visibility) {
            sections.tab.push({ key, perms: { visibility } });
        }
    }

    return { type, name, sections };
}

/** `ns__Thing__mdt` / `Thing__c` -> `ns__Thing` */
export function stripCustomEntitySuffix(name: string): string {
    return name.replace(/__(mdt|c)$/i, '');
}

function pushEnabled(target: PermissionEntry[], nodes: XmlNode[], keyTag: string): void {
    for (const item of nodes) {
        const key = text(item, keyTag);
        if (key) {
            target.push({ key, perms: { enabled: flag(item, 'enabled') } });
        }
    }
}

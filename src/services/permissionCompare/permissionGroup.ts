import { mergePerms, normalizeModel } from './normalize';
import type { PermissionEntry, PermissionModel, PermissionSection, PermissionValue } from './types';
import { PERMISSION_SECTIONS, emptySections } from './types';

/** A permission set that belongs to a group (already loaded into the permission model). */
export interface GroupComponent {
    name: string;
    model: PermissionModel;
}

function isGranted(value: PermissionValue | undefined): boolean {
    return value !== undefined && value !== false && value !== 'None';
}

function indexByKey(entries: PermissionEntry[]): Map<string, PermissionEntry> {
    return new Map(entries.map((entry) => [entry.key.toLowerCase(), entry]));
}

/**
 * Record, for every permission of `model`, which member permission sets grant it. Muting is not considered here:
 * a permission that a muting set removed is simply absent from `model`, so it never gets a source.
 */
export function attributeSources(model: PermissionModel, components: GroupComponent[]): PermissionModel {
    const indexed = components.map((component) => {
        const normalized = normalizeModel(component.model);
        const sections = {} as Record<PermissionSection, Map<string, PermissionEntry>>;
        for (const section of PERMISSION_SECTIONS) {
            sections[section] = indexByKey(normalized.sections[section]);
        }
        return { name: component.name, sections };
    });

    const result = normalizeModel(model);
    for (const section of PERMISSION_SECTIONS) {
        for (const entry of result.sections[section]) {
            const grantedBy: Record<string, string[]> = {};
            for (const [perm, value] of Object.entries(entry.perms)) {
                const names = indexed
                    .filter((component) => {
                        const theirs = component.sections[section].get(entry.key.toLowerCase())?.perms[perm];
                        // levels (tab visibility): only members granting the same level as the group count
                        return typeof value === 'string' ? theirs === value : isGranted(theirs);
                    })
                    .map((component) => component.name);
                if (names.length > 0) {
                    grantedBy[perm] = names;
                }
            }
            if (Object.keys(grantedBy).length > 0) {
                entry.grantedBy = grantedBy;
            }
        }
    }
    return result;
}

/**
 * The permissions a group grants, computed from its members like Salesforce does: the union of the member
 * permission sets, minus whatever the muting permission sets take away.
 */
export function mergeGroupModel(
    name: string,
    components: GroupComponent[],
    muting: PermissionModel[],
    warnings: string[] = [],
): PermissionModel {
    const sections = emptySections();
    for (const section of PERMISSION_SECTIONS) {
        const union = new Map<string, PermissionEntry>();
        for (const component of components) {
            for (const entry of normalizeModel(component.model).sections[section]) {
                const id = entry.key.toLowerCase();
                const existing = union.get(id);
                union.set(id, {
                    key: entry.key,
                    perms: existing ? mergePerms(existing.perms, entry.perms) : { ...entry.perms },
                });
            }
        }
        for (const mute of muting) {
            for (const entry of normalizeModel(mute).sections[section]) {
                const target = union.get(entry.key.toLowerCase());
                if (!target) {
                    continue;
                }
                for (const [perm, value] of Object.entries(entry.perms)) {
                    if (isGranted(value)) {
                        delete target.perms[perm];
                    }
                }
            }
        }
        sections[section] = [...union.values()];
    }
    const merged: PermissionModel = {
        type: 'permissionsetgroup',
        name,
        sections,
        ...(warnings.length > 0 ? { warnings } : {}),
    };
    return attributeSources(merged, components);
}

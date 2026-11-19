import type { PermissionEntry, PermissionModel, PermissionSection, PermissionValue } from './types';
import { PERMISSION_SECTIONS } from './types';

/**
 * Bring a loaded model into a canonical form so two models that grant the same access compare equal, whatever the
 * source (SOQL rows or metadata XML) and however it was written:
 * - entries / permissions are order independent (handled by keying, not by position)
 * - a permission that is `false` / absent is the same thing, so all-false entries are dropped
 * - implied permissions are made explicit (Edit implies Read, Modify All implies View All implies Read ...)
 * - tab visibility values of profiles and permission sets are mapped to one vocabulary, hidden tabs are dropped
 * - duplicate entries (case-insensitive API names) are merged
 */
export function normalizeModel(model: PermissionModel): PermissionModel {
    const sections = {} as PermissionModel['sections'];
    for (const section of PERMISSION_SECTIONS) {
        sections[section] = normalizeSection(section, model.sections[section] ?? []);
    }
    return { ...model, sections };
}

function normalizeSection(section: PermissionSection, entries: PermissionEntry[]): PermissionEntry[] {
    const merged = new Map<string, PermissionEntry>();
    for (const entry of entries) {
        const perms = normalizePerms(section, entry.perms);
        if (Object.keys(perms).length === 0) {
            continue;
        }
        const id = entry.key.toLowerCase();
        const existing = merged.get(id);
        if (existing) {
            existing.perms = normalizePerms(section, mergePerms(existing.perms, perms));
        } else {
            merged.set(id, { key: entry.key, perms });
        }
    }
    return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function mergePerms(
    a: Record<string, PermissionValue>,
    b: Record<string, PermissionValue>,
): Record<string, PermissionValue> {
    const result: Record<string, PermissionValue> = { ...a };
    for (const [name, value] of Object.entries(b)) {
        const current = result[name];
        if (typeof value === 'boolean') {
            result[name] = value || current === true;
        } else if (current === undefined || rankVisibility(value) > rankVisibility(String(current))) {
            result[name] = value;
        }
    }
    return result;
}

function normalizePerms(
    section: PermissionSection,
    perms: Record<string, PermissionValue>,
): Record<string, PermissionValue> {
    if (section === 'tab') {
        return normalizeTab(perms);
    }
    if (section === 'layoutAssignment') {
        return typeof perms.layout === 'string' && perms.layout ? { layout: perms.layout } : {};
    }

    const result: Record<string, PermissionValue> = {};
    for (const [name, value] of Object.entries(perms)) {
        if (value === true) {
            result[name] = true;
        }
    }
    if (section === 'object') {
        if (result.modifyAll) {
            result.viewAll = true;
        }
        if (result.viewAll || result.edit || result.create || result.delete) {
            result.read = true;
        }
    } else if (section === 'field' && result.edit) {
        result.read = true;
    }
    return result;
}

const TAB_VISIBILITY: Record<string, string | undefined> = {
    visible: 'Visible',
    defaulton: 'Visible',
    available: 'Available',
    defaultoff: 'Available',
    hidden: undefined,
    none: undefined,
};

function canonicalVisibility(value: string): string | undefined {
    return TAB_VISIBILITY[value.toLowerCase()];
}

function rankVisibility(value: string): number {
    const canonical = canonicalVisibility(value);
    return canonical === 'Visible' ? 2 : canonical === 'Available' ? 1 : 0;
}

function normalizeTab(perms: Record<string, PermissionValue>): Record<string, PermissionValue> {
    const raw = perms.visibility;
    const canonical = typeof raw === 'string' ? canonicalVisibility(raw) : undefined;
    return canonical ? { visibility: canonical } : {};
}

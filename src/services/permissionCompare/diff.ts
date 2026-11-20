import { normalizeModel, objectOfField, objectsWithViewAllFields } from './normalize';
import type {
    DiffEntry,
    PermissionChange,
    PermissionDiff,
    PermissionEntry,
    PermissionModel,
    PermissionSection,
    PermissionValue,
    SectionSummary,
} from './types';
import { PERMISSION_SECTIONS } from './types';

/**
 * Semantic diff of two permission models: compares what is actually granted, not how the source text looks.
 * Both models are normalized first (see `normalizeModel`), so ordering, formatting, explicit `false` flags and
 * implied permissions never show up as differences.
 */
export function diffPermissionModels(left: PermissionModel, right: PermissionModel): PermissionDiff {
    const a = normalizeModel(left);
    const b = normalizeModel(right);

    const leftViewAll = objectsWithViewAllFields(a.sections.object);
    const rightViewAll = objectsWithViewAllFields(b.sections.object);
    const entries: DiffEntry[] = [];
    const sections: SectionSummary[] = [];

    for (const section of PERMISSION_SECTIONS) {
        const leftEntries = a.sections[section];
        const rightEntries = b.sections[section];
        const summary: SectionSummary = {
            section,
            leftCount: leftEntries.length,
            rightCount: rightEntries.length,
            oneSided: (leftEntries.length === 0) !== (rightEntries.length === 0),
            added: 0,
            removed: 0,
            changed: 0,
        };

        const rightByKey = new Map(rightEntries.map((entry) => [entry.key.toLowerCase(), entry]));
        const seen = new Set<string>();

        for (const entry of leftEntries) {
            const id = entry.key.toLowerCase();
            seen.add(id);
            const other = rightByKey.get(id) ?? impliedField(section, entry, rightViewAll);
            const diff = other ? compareEntry(section, entry, other) : removed(section, entry);
            if (diff) {
                entries.push(diff);
                summary[diff.status] += 1;
            }
        }
        for (const entry of rightEntries) {
            if (!seen.has(entry.key.toLowerCase())) {
                const other = impliedField(section, entry, leftViewAll);
                const diff = other ? compareEntry(section, other, entry) : added(section, entry);
                if (diff) {
                    entries.push(diff);
                    summary[diff.status] += 1;
                }
            }
        }
        sections.push(summary);
    }

    return { entries, sections };
}

/** `grantedBy` of each side, only when present (keeps ordinary diffs free of empty fields) */
function sources(left: PermissionEntry | undefined, right: PermissionEntry | undefined) {
    return {
        ...(left?.grantedBy ? { leftGrantedBy: left.grantedBy } : {}),
        ...(right?.grantedBy ? { rightGrantedBy: right.grantedBy } : {}),
    };
}

function removed(section: PermissionSection, entry: PermissionEntry): DiffEntry {
    return { section, key: entry.key, status: 'removed', left: entry.perms, ...sources(entry, undefined), changes: [] };
}

function added(section: PermissionSection, entry: PermissionEntry): DiffEntry {
    return { section, key: entry.key, status: 'added', right: entry.perms, ...sources(undefined, entry), changes: [] };
}

/**
 * A field that one side does not list but whose object has View All Fields on that side still is readable there:
 * the missing side then holds an implied read-only entry, so only a real difference (e.g. Edit) is reported.
 */
function impliedField(
    section: PermissionSection,
    entry: PermissionEntry,
    otherViewAll: Set<string>,
): PermissionEntry | undefined {
    return section === 'field' && otherViewAll.has(objectOfField(entry.key))
        ? { key: entry.key, perms: { read: true } }
        : undefined;
}

function compareEntry(
    section: PermissionSection,
    left: PermissionEntry,
    right: PermissionEntry,
): DiffEntry | undefined {
    const changes: PermissionChange[] = [];
    const names = [...new Set([...Object.keys(left.perms), ...Object.keys(right.perms)])].sort();
    for (const perm of names) {
        const l = left.perms[perm] ?? defaultValue(right.perms[perm]);
        const r = right.perms[perm] ?? defaultValue(left.perms[perm]);
        if (l !== r) {
            changes.push({ perm, left: l, right: r });
        }
    }
    if (changes.length === 0) {
        return undefined;
    }
    return {
        section,
        key: left.key,
        status: 'changed',
        left: left.perms,
        right: right.perms,
        ...sources(left, right),
        changes,
    };
}

/** What "not granted" looks like for a permission of the same kind as `sample` */
function defaultValue(sample: PermissionValue | undefined): PermissionValue {
    return typeof sample === 'string' ? 'None' : false;
}

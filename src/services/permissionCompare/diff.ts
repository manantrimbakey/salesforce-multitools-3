import { normalizeModel } from './normalize';
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
            const other = rightByKey.get(id);
            const diff = other ? compareEntry(section, entry, other) : removed(section, entry);
            if (diff) {
                entries.push(diff);
                summary[diff.status] += 1;
            }
        }
        for (const entry of rightEntries) {
            if (!seen.has(entry.key.toLowerCase())) {
                entries.push(added(section, entry));
                summary.added += 1;
            }
        }
        sections.push(summary);
    }

    return { entries, sections };
}

function removed(section: PermissionSection, entry: PermissionEntry): DiffEntry {
    return { section, key: entry.key, status: 'removed', left: entry.perms, changes: [] };
}

function added(section: PermissionSection, entry: PermissionEntry): DiffEntry {
    return { section, key: entry.key, status: 'added', right: entry.perms, changes: [] };
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
    return { section, key: left.key, status: 'changed', left: left.perms, right: right.perms, changes };
}

/** What "not granted" looks like for a permission of the same kind as `sample` */
function defaultValue(sample: PermissionValue | undefined): PermissionValue {
    return typeof sample === 'string' ? 'None' : false;
}

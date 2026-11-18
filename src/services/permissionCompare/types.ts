/** Kinds of permission data that can be compared. Each one is a separate "section" of a permission set / profile. */
export const PERMISSION_SECTIONS = [
    'object',
    'field',
    'system',
    'apexClass',
    'vfPage',
    'customPermission',
    'tab',
    'application',
    'flow',
    'externalDataSource',
    'customEntity',
] as const;

export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];

export type PermissionItemType = 'permissionset' | 'profile';

/** A single permission value: a flag (`true`), or a named level such as tab visibility. */
export type PermissionValue = boolean | string;

/** One securable thing (an object, a field, an Apex class ...) and the permissions granted on it. */
export interface PermissionEntry {
    /** API name, e.g. `Account`, `Account.Name`, `MyClass`, `ViewSetup`, `standard-Account` */
    key: string;
    perms: Record<string, PermissionValue>;
}

/** Everything a permission set / profile grants, independent of where it was loaded from. */
export interface PermissionModel {
    type: PermissionItemType;
    name: string;
    sections: Record<PermissionSection, PermissionEntry[]>;
}

export function emptySections(): Record<PermissionSection, PermissionEntry[]> {
    return {
        object: [],
        field: [],
        system: [],
        apexClass: [],
        vfPage: [],
        customPermission: [],
        tab: [],
        application: [],
        flow: [],
        externalDataSource: [],
        customEntity: [],
    };
}

export type DiffStatus = 'added' | 'removed' | 'changed';

export interface PermissionChange {
    perm: string;
    /** Value on the left side; `false` / `none` when the side does not grant it */
    left: PermissionValue;
    right: PermissionValue;
}

export interface DiffEntry {
    section: PermissionSection;
    key: string;
    /** `added` = only on the right, `removed` = only on the left */
    status: DiffStatus;
    left?: Record<string, PermissionValue>;
    right?: Record<string, PermissionValue>;
    /** Only the permissions whose value differs (for `changed`) */
    changes: PermissionChange[];
}

export interface SectionSummary {
    section: PermissionSection;
    leftCount: number;
    rightCount: number;
    /**
     * True when exactly one side grants anything in this section. For branch-vs-org compares this usually means the
     * repository file simply does not contain that part, not that the permissions really differ.
     */
    oneSided: boolean;
    added: number;
    removed: number;
    changed: number;
}

export interface PermissionDiff {
    entries: DiffEntry[];
    sections: SectionSummary[];
}

/** Where a permission set / profile is loaded from. */
export type PermissionSource = { kind: 'org'; username: string } | { kind: 'branch'; ref: string };

/** Pseudo ref meaning "the files currently on disk" (uncommitted changes included). */
export const WORKING_TREE_REF = '@working-tree';

export interface PermissionItemRef {
    type: PermissionItemType;
    /** Org: PermissionSet Id. Branch: path of the metadata file relative to the repository root. */
    id: string;
}

export interface PermissionItemOption {
    id: string;
    /** Name used to match the same item across sources (file base name / API name, decoded) */
    name: string;
    label: string;
    type: PermissionItemType;
}

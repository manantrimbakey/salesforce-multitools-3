/** Response shapes of the extension's server API. */

export interface ApexLog {
    Id: string;
    LogUser: { Name: string };
    LogLength: number;
    StartTime: string;
    Operation: string;
    Application: string;
    Status: string;
    RequestIdentifier: string;
}

export interface SfUser {
    Id: string;
    Name: string;
    Username?: string;
    TraceFlagId?: string;
    TraceFlagActive?: boolean;
    TraceFlagExpirationDate?: string;
    /** DeveloperName of the debug level the active trace flag uses. */
    TraceFlagDebugLevel?: string | null;
}

export interface CurrentUserInfo {
    display_name: string;
    username: string;
}

export type SizeDirection = 'above' | 'below';

export interface LogsResponse {
    success: true;
    // The server returns `{}` when the org has no logs, so `records` may be absent.
    logs: { records?: ApexLog[]; totalSize?: number; done?: boolean };
}

export interface UsersResponse {
    success: true;
    users: SfUser[];
    currentUser?: CurrentUserInfo;
}

export interface MethodNameResponse {
    success: true;
    methodName: string;
    logId: string;
}

export interface DeleteLogsResponse {
    success: true;
    deleted?: number;
    failed?: number;
    total?: number;
}

export interface DebugLevel {
    Id: string;
    DeveloperName: string;
    MasterLabel: string;
}

export interface DebugLevelsResponse {
    success: true;
    debugLevels: DebugLevel[];
}

export interface TraceFlagResponse {
    success: true;
    traceFlagId?: string;
    message?: string;
}

export interface LogsQuery {
    /** User name, or 'all'. */
    user: string;
    size?: string;
    sizeDirection?: SizeDirection;
}

// ---- Permission compare ----

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
    'externalCredentialPrincipal',
    'connectedApp',
    'recordType',
    'layoutAssignment',
    'customEntity',
] as const;
export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];
export type PermissionItemType = 'permissionset' | 'profile';
export type PermissionValue = boolean | string;
export type DiffStatus = 'added' | 'removed' | 'changed';

export type CompareSource = { kind: 'org'; username: string } | { kind: 'branch'; ref: string };

export interface AuthorizedOrg {
    username: string;
    alias?: string;
    isDefault: boolean;
    isSandbox: boolean;
    isScratchOrg: boolean;
}

export interface GitRef {
    name: string;
    kind: 'branch' | 'remote' | 'tag';
}

export interface CompareContextResponse {
    success: true;
    orgs: AuthorizedOrg[];
    git: { available: boolean; refs: GitRef[]; workingTreeRef: string };
}

export interface PermissionItemOption {
    id: string;
    name: string;
    label: string;
    type: PermissionItemType;
}

export interface CompareItemsResponse {
    success: true;
    items: PermissionItemOption[];
}

export interface CompareSide {
    source: CompareSource;
    item: { type: PermissionItemType; id: string };
}

export interface PermissionChange {
    perm: string;
    left: PermissionValue;
    right: PermissionValue;
}

export interface DiffEntry {
    section: PermissionSection;
    key: string;
    status: DiffStatus;
    left?: Record<string, PermissionValue>;
    right?: Record<string, PermissionValue>;
    changes: PermissionChange[];
}

export interface SectionSummary {
    section: PermissionSection;
    leftCount: number;
    rightCount: number;
    oneSided: boolean;
    added: number;
    removed: number;
    changed: number;
}

export interface CompareResponse {
    success: true;
    left: { name: string; type: PermissionItemType };
    right: { name: string; type: PermissionItemType };
    diff: { entries: DiffEntry[]; sections: SectionSummary[] };
}

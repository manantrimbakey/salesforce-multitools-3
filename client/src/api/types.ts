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

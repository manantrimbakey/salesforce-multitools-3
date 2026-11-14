import type { SfUser } from '../../../api/client';

/** What the user picker can hold: the "All Users" pseudo-option or a real user. */
export type UserOption = { kind: 'all' } | { kind: 'user'; user: SfUser };

export const ALL_USERS: UserOption = { kind: 'all' };

/** Id used for the signed-in user when the org's user list does not contain them. Has no trace-flag support. */
export const CURRENT_USER_FALLBACK_ID = 'current';

/**
 * Value sent to the server to filter logs by user. The server matches on `LogUser.Name`
 * (not Id), and 'all' means no filter. Every fetch/refresh/delete goes through here.
 */
export function userFilterOf(option: UserOption | null): string {
    return option === null || option.kind === 'all' ? 'all' : option.user.Name;
}

export function optionKey(option: UserOption): string {
    return option.kind === 'all' ? 'all' : option.user.Id;
}

export function optionLabel(option: UserOption): string {
    return option.kind === 'all' ? 'All Users' : option.user.Name;
}

/** Trace flags can only be managed for users with a real Salesforce Id. */
export function hasRealUserId(user: SfUser): boolean {
    return Boolean(user.Id) && user.Id !== CURRENT_USER_FALLBACK_ID;
}

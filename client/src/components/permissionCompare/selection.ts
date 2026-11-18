import type { PermissionItemOption, PermissionItemType } from '../../api/client';

/** What the user picked for one side. `org` / `ref` hold the org username or the branch / tag name. */
export interface SideSelection {
    kind: 'org' | 'branch';
    org: string;
    ref: string;
    type: PermissionItemType;
    item: PermissionItemOption | null;
}

export function toSource(selection: SideSelection) {
    if (selection.kind === 'org') {
        return selection.org ? ({ kind: 'org', username: selection.org } as const) : null;
    }
    return selection.ref ? ({ kind: 'branch', ref: selection.ref } as const) : null;
}

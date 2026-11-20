import type { PermissionSection, PermissionValue } from '../../api/client';

export const SECTION_LABELS: Record<PermissionSection, string> = {
    object: 'Object permissions',
    field: 'Field permissions',
    system: 'System permissions',
    apexClass: 'Apex classes',
    vfPage: 'Visualforce pages',
    customPermission: 'Custom permissions',
    tab: 'Tab settings',
    application: 'App visibility',
    flow: 'Flows',
    externalDataSource: 'External data sources',
    externalCredentialPrincipal: 'External credential principals',
    connectedApp: 'Connected & external client apps',
    recordType: 'Record type visibility',
    layoutAssignment: 'Page layout assignments',
    loginHours: 'Login hours',
    loginIpRange: 'Login IP ranges',
    groupMember: 'Group members (permission sets)',
    assignment: 'Assigned users',
    customEntity: 'Custom metadata & settings',
};

const PERM_LABELS: Record<string, string> = {
    create: 'Create',
    read: 'Read',
    edit: 'Edit',
    delete: 'Delete',
    viewAll: 'View All Records',
    modifyAll: 'Modify All Records',
    viewAllFields: 'View All Fields',
    enabled: 'Enabled',
    visible: 'Visible',
    visibility: 'Visibility',
    default: 'Default',
    personAccountDefault: 'Person account default',
    layout: 'Layout',
    hours: 'Hours',
    allowed: 'Allowed',
    member: 'Member',
    assigned: 'Assigned',
};

export function permLabel(perm: string): string {
    return PERM_LABELS[perm] ?? perm;
}

/** Human readable value: flags become Yes / No, named levels stay as they are. */
export function valueLabel(value: PermissionValue): string {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return value;
}

import type { DiffEntry, PermissionSection, PermissionValue } from './types';
import { PERMISSION_SECTIONS } from './types';

export type ExportFormat = 'markdown' | 'csv';

export interface ExportInput {
    leftLabel: string;
    rightLabel: string;
    entries: DiffEntry[];
}

const SECTION_LABELS: Record<PermissionSection, string> = {
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
    customEntity: 'Custom metadata & settings',
};

const PERM_LABELS: Record<string, string> = {
    create: 'Create',
    read: 'Read',
    edit: 'Edit',
    delete: 'Delete',
    viewAll: 'View All',
    modifyAll: 'Modify All',
    enabled: 'Enabled',
    visible: 'Visible',
    visibility: 'Visibility',
    default: 'Default',
    personAccountDefault: 'Person account default',
    layout: 'Layout',
};

const STATUS_LABELS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

const permLabel = (perm: string): string => PERM_LABELS[perm] ?? perm;

function isGranted(value: PermissionValue | undefined): boolean {
    return value !== undefined && value !== false && value !== 'None';
}

function valueLabel(value: PermissionValue | undefined): string {
    if (value === undefined || value === false) {
        return 'No';
    }
    return value === true ? 'Yes' : value;
}

/** What one side grants, e.g. `Read, Edit` or `Visibility: Visible`; `-` when nothing. */
function describePerms(perms: Record<string, PermissionValue> | undefined): string {
    const parts = Object.entries(perms ?? {})
        .filter(([, value]) => isGranted(value))
        .map(([name, value]) => (typeof value === 'string' ? `${permLabel(name)}: ${value}` : permLabel(name)));
    return parts.length > 0 ? parts.join(', ') : '(none)';
}

/** `Edit: No -> Yes` for each permission that differs (changed entries only). */
function describeChanges(entry: DiffEntry): string {
    return entry.changes.map((c) => `${permLabel(c.perm)}: ${valueLabel(c.left)} -> ${valueLabel(c.right)}`).join('; ');
}

function sorted(entries: DiffEntry[]): DiffEntry[] {
    const rank = (section: PermissionSection) => PERMISSION_SECTIONS.indexOf(section);
    return [...entries].sort((a, b) => rank(a.section) - rank(b.section) || a.key.localeCompare(b.key));
}

/**
 * Quote a CSV field. Values come from an org / repository, so a leading `= + - @` (spreadsheet formula) is
 * defused with a quote before it reaches Excel or Sheets.
 */
function csvField(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv({ leftLabel, rightLabel, entries }: ExportInput): string {
    const header = ['Section', 'Name', 'Difference', `Base: ${leftLabel}`, `Compare to: ${rightLabel}`, 'Changes'];
    const rows = sorted(entries).map((entry) => [
        SECTION_LABELS[entry.section],
        entry.key,
        STATUS_LABELS[entry.status],
        describePerms(entry.left),
        describePerms(entry.right),
        describeChanges(entry),
    ]);
    // BOM so Excel opens it as UTF-8
    return '﻿' + [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Escape text for a Markdown table cell (and keep the cell on one line). */
function mdCell(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/[`*_<\[\]]/g, (char) => `\\${char}`)
        .replace(/\r?\n/g, ' ');
}

export function toMarkdown({ leftLabel, rightLabel, entries }: ExportInput): string {
    const count = { added: 0, removed: 0, changed: 0 };
    for (const entry of entries) {
        count[entry.status] += 1;
    }
    const lines = [
        '# Permission comparison',
        '',
        `- **Base:** ${mdCell(leftLabel)}`,
        `- **Compare to:** ${mdCell(rightLabel)}`,
        `- **Differences:** ${entries.length} (${count.added} only in compare-to, ${count.removed} only in base, ${count.changed} changed)`,
    ];
    if (entries.length === 0) {
        lines.push('', 'No differences. Both sides grant the same permissions.');
    }
    for (const section of PERMISSION_SECTIONS) {
        const inSection = sorted(entries.filter((entry) => entry.section === section));
        if (inSection.length === 0) {
            continue;
        }
        lines.push('', `## ${SECTION_LABELS[section]} (${inSection.length})`, '');
        lines.push('| Name | Difference | Base | Compare to | Changes |', '| --- | --- | --- | --- | --- |');
        for (const entry of inSection) {
            lines.push(
                `| ${[
                    mdCell(entry.key),
                    STATUS_LABELS[entry.status],
                    mdCell(describePerms(entry.left)),
                    mdCell(describePerms(entry.right)),
                    mdCell(describeChanges(entry)),
                ].join(' | ')} |`,
            );
        }
    }
    return lines.join('\n') + '\n';
}

export function formatExport(format: ExportFormat, input: ExportInput): string {
    return format === 'csv' ? toCsv(input) : toMarkdown(input);
}

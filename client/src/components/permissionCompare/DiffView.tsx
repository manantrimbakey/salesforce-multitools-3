import { useMemo, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Chip,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import type { CompareResponse, DiffEntry, DiffStatus, PermissionSection, PermissionValue } from '../../api/client';
import { SECTION_LABELS, permLabel, valueLabel } from './labels';

const STATUS_COLOR = { added: 'success', removed: 'error', changed: 'warning' } as const;
const STATUS_SYMBOL: Record<DiffStatus, string> = { added: '+', removed: '−', changed: '~' };
const PAGE = 100;

interface Props {
    result: CompareResponse;
    leftLabel: string;
    rightLabel: string;
    /** Sections where only one side has data are probably an incomplete file, not a real difference */
    mixedSources: boolean;
}

export function DiffView({ result, leftLabel, rightLabel, mixedSources }: Props) {
    const { entries, sections } = result.diff;
    const [statusFilter, setStatusFilter] = useState<'all' | DiffStatus>('all');
    const [hidden, setHidden] = useState<PermissionSection[]>([]);
    const [query, setQuery] = useState('');
    const [ignoreOneSided, setIgnoreOneSided] = useState(mixedSources);

    const oneSided = useMemo(() => new Set(sections.filter((s) => s.oneSided).map((s) => s.section)), [sections]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return entries.filter(
            (entry) =>
                (statusFilter === 'all' || entry.status === statusFilter) &&
                !hidden.includes(entry.section) &&
                !(ignoreOneSided && oneSided.has(entry.section)) &&
                (!needle || entry.key.toLowerCase().includes(needle)),
        );
    }, [entries, statusFilter, hidden, query, ignoreOneSided, oneSided]);

    const bySection = useMemo(() => {
        const groups = new Map<PermissionSection, DiffEntry[]>();
        for (const entry of visible) groups.set(entry.section, [...(groups.get(entry.section) ?? []), entry]);
        return groups;
    }, [visible]);

    const totals = useMemo(() => {
        const count = { added: 0, removed: 0, changed: 0 };
        for (const entry of visible) count[entry.status] += 1;
        return count;
    }, [visible]);

    const sectionsWithDiffs = sections.filter(
        (s) => s.added + s.removed + s.changed > 0 && !(ignoreOneSided && s.oneSided),
    );
    const toggleSection = (section: PermissionSection) =>
        setHidden((current) =>
            current.includes(section) ? current.filter((s) => s !== section) : [...current, section],
        );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={`+ ${totals.added} only in ${rightLabel}`}
                />
                <Chip
                    size="small"
                    color="error"
                    variant="outlined"
                    label={`− ${totals.removed} only in ${leftLabel}`}
                />
                <Chip size="small" color="warning" variant="outlined" label={`~ ${totals.changed} changed`} />
                <Box sx={{ flex: 1 }} />
                <TextField
                    size="small"
                    placeholder="Filter by name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    sx={{ minWidth: 180 }}
                />
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={statusFilter}
                    onChange={(_, next: 'all' | DiffStatus | null) => next && setStatusFilter(next)}
                    aria-label="Difference kinds"
                >
                    <ToggleButton value="all">All</ToggleButton>
                    <ToggleButton value="added">Added</ToggleButton>
                    <ToggleButton value="removed">Removed</ToggleButton>
                    <ToggleButton value="changed">Changed</ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                <Typography variant="caption" color="text.secondary">
                    Permission types:
                </Typography>
                {sectionsWithDiffs.map((summary) => {
                    const active = !hidden.includes(summary.section);
                    return (
                        <Chip
                            key={summary.section}
                            size="small"
                            clickable
                            color={active ? 'primary' : 'default'}
                            variant={active ? 'filled' : 'outlined'}
                            onClick={() => toggleSection(summary.section)}
                            label={`${SECTION_LABELS[summary.section]} · ${summary.added + summary.removed + summary.changed}`}
                        />
                    );
                })}
                {hidden.length > 0 && (
                    <Button size="small" onClick={() => setHidden([])}>
                        Show all
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                {oneSided.size > 0 && (
                    <Tooltip title="Some sections have data on one side only (for example a repository file that does not contain field permissions). Those are skipped so they do not look like real differences.">
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={ignoreOneSided}
                                    onChange={(_, v) => setIgnoreOneSided(v)}
                                />
                            }
                            label={<Typography variant="caption">Skip sections only one side has</Typography>}
                        />
                    </Tooltip>
                )}
            </Stack>

            {entries.length === 0 && (
                <Alert severity="success">No differences. Both sides grant the same permissions.</Alert>
            )}
            {entries.length > 0 && visible.length === 0 && (
                <Alert severity="info">Nothing matches the current filters.</Alert>
            )}

            {visible.length > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, px: 1.5 }}>
                    <Typography variant="subtitle2" noWrap title={leftLabel}>
                        {leftLabel}
                    </Typography>
                    <Typography variant="subtitle2" noWrap title={rightLabel}>
                        {rightLabel}
                    </Typography>
                </Box>
            )}

            <Box sx={{ overflow: 'auto', minHeight: 0 }}>
                {[...bySection.entries()].map(([section, sectionEntries]) => (
                    <SectionGroup key={section} section={section} entries={sectionEntries} />
                ))}
            </Box>
        </Box>
    );
}

function SectionGroup({ section, entries }: { section: PermissionSection; entries: DiffEntry[] }) {
    const [shown, setShown] = useState(PAGE);
    return (
        <Accordion
            defaultExpanded
            disableGutters
            variant="outlined"
            square
            slotProps={{ transition: { unmountOnExit: true } }}
        >
            <AccordionSummary>
                <Typography variant="subtitle2">
                    {SECTION_LABELS[section]}{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                        ({entries.length})
                    </Typography>
                </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
                {entries.slice(0, shown).map((entry) => (
                    <EntryRow key={`${entry.section}:${entry.key}`} entry={entry} />
                ))}
                {entries.length > shown && (
                    <Button size="small" onClick={() => setShown(shown + PAGE)} sx={{ m: 1 }}>
                        Show {Math.min(PAGE, entries.length - shown)} more ({entries.length - shown} left)
                    </Button>
                )}
            </AccordionDetails>
        </Accordion>
    );
}

const PERM_ORDER = ['create', 'read', 'edit', 'delete', 'viewAll', 'modifyAll', 'enabled', 'visible', 'visibility'];

function sortedPerms(names: string[]): string[] {
    const rank = (name: string) => (PERM_ORDER.includes(name) ? PERM_ORDER.indexOf(name) : PERM_ORDER.length);
    return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function isGranted(value: PermissionValue | undefined): boolean {
    return value !== undefined && value !== false && value !== 'None';
}

/** One side of a row: every permission this side grants. Differences are highlighted; missing ones are struck out. */
function SideCell({
    perms,
    other,
}: {
    perms: Record<string, PermissionValue> | undefined;
    other: Record<string, PermissionValue> | undefined;
}) {
    const names = sortedPerms([...new Set([...Object.keys(perms ?? {}), ...Object.keys(other ?? {})])]);
    if (!perms || !names.some((name) => isGranted(perms[name]) || isGranted(other?.[name]))) {
        return (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Not granted
            </Typography>
        );
    }
    return (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {names.map((name) => {
                const mine = perms[name];
                const theirs = other?.[name];
                const has = isGranted(mine);
                const differs = mine !== theirs && (has || isGranted(theirs));
                const label =
                    typeof mine === 'string' || typeof theirs === 'string'
                        ? `${permLabel(name)}: ${has ? valueLabel(mine as PermissionValue) : 'None'}`
                        : permLabel(name);
                if (!has) {
                    // granted on the other side only: show what is missing here
                    return (
                        <Chip
                            key={name}
                            size="small"
                            variant="outlined"
                            label={label}
                            sx={{ textDecoration: 'line-through', opacity: 0.55, borderStyle: 'dashed' }}
                            title={`${permLabel(name)} is not granted on this side`}
                        />
                    );
                }
                return (
                    <Chip
                        key={name}
                        size="small"
                        label={label}
                        variant={differs ? 'filled' : 'outlined'}
                        color={differs ? 'warning' : 'default'}
                    />
                );
            })}
        </Stack>
    );
}

function EntryRow({ entry }: { entry: DiffEntry }) {
    return (
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 0.75 }}>
                <Chip
                    size="small"
                    color={STATUS_COLOR[entry.status]}
                    label={STATUS_SYMBOL[entry.status]}
                    sx={{ minWidth: 28, fontWeight: 700 }}
                    aria-label={entry.status}
                />
                <Typography
                    variant="body2"
                    sx={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', wordBreak: 'break-all' }}
                >
                    {entry.key}
                </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, px: 1.5, pb: 0.75, pt: 0.5 }}>
                <Box sx={{ p: 0.75, borderRadius: 0.5, bgcolor: 'action.hover' }}>
                    <SideCell perms={entry.left} other={entry.right} />
                </Box>
                <Box sx={{ p: 0.75, borderRadius: 0.5, bgcolor: 'action.hover' }}>
                    <SideCell perms={entry.right} other={entry.left} />
                </Box>
            </Box>
        </Box>
    );
}

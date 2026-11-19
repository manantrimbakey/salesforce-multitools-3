import { useEffect, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    CircularProgress,
    MenuItem,
    Paper,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import type { CompareContextResponse, PermissionItemType } from '../../api/client';
import { toSource } from './selection';
import type { SideSelection } from './selection';
import { useCompareItems } from './useCompareItems';

interface Props {
    title: string;
    context: CompareContextResponse;
    value: SideSelection;
    onChange: (next: SideSelection) => void;
    /** Item name to pre-select when it exists in this side's list (the other side's pick) */
    suggestName?: string;
}

export function SourcePanel({ title, context, value, onChange, suggestName }: Props) {
    const source = toSource(value);
    const { items, loading, error } = useCompareItems(source, value.type);
    const gitAvailable = context.git.available;

    // Pre-select the same-named item once the list is there and nothing is selected yet
    const suggested = !value.item && suggestName ? items.find((item) => item.name === suggestName) : undefined;
    useEffect(() => {
        if (suggested) onChange({ ...value, item: suggested });
        // only when a new suggestion appears
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suggested]);

    // The typed text is kept here (not reset to the selected item's label by the Autocomplete) so a click away
    // does not wipe it; it only follows the selection when the selection changes.
    const [itemInput, setItemInput] = useState(value.item?.label ?? '');
    useEffect(() => {
        if (value.item) setItemInput(value.item.label);
    }, [value.item]);
    // A different org / ref / type is a different list: start with an empty field
    const listKey = JSON.stringify([source, value.type]);
    useEffect(() => {
        setItemInput('');
    }, [listKey]);
    const matchItem = (text: string) => {
        const wanted = text.trim().toLowerCase();
        return wanted
            ? items.find((item) => item.label.toLowerCase() === wanted || item.name.toLowerCase() === wanted)
            : undefined;
    };

    const sourceLabel =
        value.kind === 'org'
            ? (context.orgs.find((org) => org.username === value.org)?.alias ?? value.org)
            : value.ref === context.git.workingTreeRef
              ? 'the working tree'
              : value.ref;
    const kindLabel = value.type === 'profile' ? 'profile' : 'permission set';
    // Tell the user why nothing can be picked instead of leaving an empty / silent field
    const typedText = itemInput.trim().toLowerCase();
    let itemHint: string | undefined;
    if (source && !loading && !error && !value.item) {
        if (typedText && !items.some((item) => item.label.toLowerCase().includes(typedText))) {
            itemHint = `No ${kindLabel} matching "${itemInput.trim()}" in ${sourceLabel}`;
        } else if (!typedText && suggestName && !items.some((item) => item.name === suggestName)) {
            itemHint = `"${suggestName}" does not exist in ${sourceLabel}`;
        }
    }

    const patch = (next: Partial<SideSelection>) => onChange({ ...value, ...next });

    return (
        <Paper
            variant="outlined"
            sx={{ p: 1.5, flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 1.25 }}
        >
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                {title}
            </Typography>

            <ToggleButtonGroup
                exclusive
                size="small"
                fullWidth
                value={value.kind}
                onChange={(_, kind: 'org' | 'branch' | null) => kind && patch({ kind, item: null })}
                aria-label={`${title} source`}
            >
                <ToggleButton value="org" sx={{ flex: '1 1 0' }}>
                    Org
                </ToggleButton>
                <Tooltip title={gitAvailable ? '' : 'This project is not under git source control'}>
                    <span style={{ display: 'flex', flex: '1 1 0' }}>
                        <ToggleButton value="branch" disabled={!gitAvailable} sx={{ flex: 1 }}>
                            Branch / tag
                        </ToggleButton>
                    </span>
                </Tooltip>
            </ToggleButtonGroup>

            {value.kind === 'org' ? (
                <TextField
                    select
                    size="small"
                    label="Org"
                    value={value.org}
                    onChange={(event) => patch({ org: event.target.value, item: null })}
                    error={context.orgs.length === 0}
                    helperText={context.orgs.length === 0 ? 'No authorized orgs found (sf org login)' : undefined}
                >
                    {context.orgs.map((org) => (
                        <MenuItem key={org.username} value={org.username}>
                            {org.alias ? `${org.alias} (${org.username})` : org.username}
                            {org.isDefault ? ' · default' : ''}
                        </MenuItem>
                    ))}
                </TextField>
            ) : (
                <Autocomplete
                    size="small"
                    options={[context.git.workingTreeRef, ...context.git.refs.map((ref) => ref.name)]}
                    value={value.ref || null}
                    onChange={(_, ref) => patch({ ref: ref ?? '', item: null })}
                    getOptionLabel={(ref) =>
                        ref === context.git.workingTreeRef ? 'Working tree (uncommitted files)' : ref
                    }
                    renderInput={(params) => <TextField {...params} label="Branch, tag or working tree" />}
                />
            )}

            <ToggleButtonGroup
                exclusive
                size="small"
                fullWidth
                value={value.type}
                onChange={(_, type: PermissionItemType | null) => type && patch({ type, item: null })}
                aria-label={`${title} metadata type`}
            >
                <ToggleButton value="permissionset">Permission set</ToggleButton>
                <ToggleButton value="profile">Profile</ToggleButton>
            </ToggleButtonGroup>

            <Autocomplete
                size="small"
                options={items}
                value={value.item}
                loading={loading}
                disabled={!source}
                inputValue={itemInput}
                onInputChange={(_, text, reason) => {
                    // 'reset' is the Autocomplete syncing to the selection; the effect above already handles it
                    if (reason === 'reset') return;
                    setItemInput(text);
                    if (reason === 'clear') patch({ item: null });
                    else if (!value.item || value.item.label !== text) patch({ item: matchItem(text) ?? null });
                }}
                clearOnBlur={false}
                onChange={(_, item) => patch({ item })}
                getOptionLabel={(item) => item.label}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText={error ? 'Could not load' : 'None found'}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label={value.type === 'profile' ? 'Profile' : 'Permission set'}
                        error={!!itemHint}
                        helperText={itemHint}
                        slotProps={{
                            input: {
                                ...params.InputProps,
                                endAdornment: (
                                    <>
                                        {loading ? <CircularProgress size={16} /> : null}
                                        {params.InputProps.endAdornment}
                                    </>
                                ),
                            },
                        }}
                    />
                )}
            />
            {error && (
                <Alert severity="error" sx={{ py: 0 }}>
                    <Box sx={{ wordBreak: 'break-word' }}>{error}</Box>
                </Alert>
            )}
        </Paper>
    );
}

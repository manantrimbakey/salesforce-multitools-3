import { useEffect } from 'react';
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
                onChange={(_, item) => patch({ item })}
                getOptionLabel={(item) => item.label}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText={error ? 'Could not load' : 'None found'}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label={value.type === 'profile' ? 'Profile' : 'Permission set'}
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

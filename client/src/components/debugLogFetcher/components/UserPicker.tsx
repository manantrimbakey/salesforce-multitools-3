import { memo, useMemo } from 'react';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import type { SfUser } from '../../../api/client';
import { ALL_USERS, optionKey, optionLabel } from '../utils/user';
import type { UserOption } from '../utils/user';
import { ExpirationText } from './ExpirationText';

interface Props {
    users: SfUser[];
    selected: UserOption;
    loading: boolean;
    onSelect: (option: UserOption) => void;
    onSearch: (term: string) => void;
}

function UserPickerImpl({ users, selected, loading, onSelect, onSearch }: Props) {
    const options = useMemo<UserOption[]>(() => {
        const listed = users.map((user): UserOption => ({ kind: 'user', user }));
        // Keep the current selection selectable even if a search no longer lists it.
        const keepSelected = selected.kind === 'user' && !users.some((u) => u.Id === selected.user.Id);
        return [ALL_USERS, ...(keepSelected ? [selected] : []), ...listed];
    }, [users, selected]);

    return (
        <Autocomplete<UserOption, false, true>
            sx={{ width: '20rem', maxWidth: '100%' }}
            size="small"
            disableClearable
            options={options}
            value={selected}
            loading={loading}
            loadingText="Searching..."
            noOptionsText="Type to search users..."
            getOptionKey={optionKey}
            getOptionLabel={optionLabel}
            isOptionEqualToValue={(option, value) => optionKey(option) === optionKey(value)}
            filterOptions={(all) => all} // filtering is done server side
            onChange={(_event, option) => onSelect(option)}
            onInputChange={(_event, value, reason) => {
                // 'reset' fires when the input is programmatically set to the selected label.
                if (reason !== 'reset') onSearch(value);
            }}
            renderOption={(props, option) => {
                const { key, ...liProps } = props;
                return (
                    <li key={key} {...liProps}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap>
                                {optionLabel(option)}
                            </Typography>
                            {option.kind === 'user' && (
                                <>
                                    {option.user.Username && (
                                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                                            {option.user.Username}
                                        </Typography>
                                    )}
                                    <Typography
                                        variant="caption"
                                        display="block"
                                        color={option.user.TraceFlagActive ? 'success.main' : 'text.secondary'}
                                    >
                                        {option.user.TraceFlagActive
                                            ? `● Logging Active${option.user.TraceFlagDebugLevel ? ` · ${option.user.TraceFlagDebugLevel}` : ''}`
                                            : '○ Logging Inactive'}
                                    </Typography>
                                    {option.user.TraceFlagActive && option.user.TraceFlagExpirationDate && (
                                        <ExpirationText
                                            date={option.user.TraceFlagExpirationDate}
                                            display="block"
                                            sx={{ fontSize: '0.65rem' }}
                                        />
                                    )}
                                </>
                            )}
                        </Box>
                    </li>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Filter by User"
                    placeholder="Start typing..."
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            startAdornment: (
                                <>
                                    <FilterListIcon fontSize="small" sx={{ mr: 0.5, color: 'action.active' }} />
                                    {params.InputProps.startAdornment}
                                </>
                            ),
                            endAdornment: (
                                <>
                                    {loading && <CircularProgress size={18} />}
                                    {params.InputProps.endAdornment}
                                </>
                            ),
                        },
                    }}
                />
            )}
        />
    );
}

export const UserPicker = memo(UserPickerImpl);

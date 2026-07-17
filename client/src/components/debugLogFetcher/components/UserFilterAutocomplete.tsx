import { Autocomplete, Box, Typography, IconButton, Tooltip, CircularProgress, TextField } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import StopIcon from '@mui/icons-material/Stop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { User } from '../types';
import React, { useMemo } from 'react';

interface Props {
    users: User[];
    loadingUsers: boolean;
    selectedUser: User | { Id: string; Name: string } | null;
    traceFlagOperations: Set<string>;
    onUserChange: (event: React.SyntheticEvent, newValue: User | { Id: string; Name: string } | null) => void;
    onInputChange: (newInputValue: string) => void;
    onStartLogging: (userId: string) => void;
    onStopLogging: (userId: string, traceFlagId: string) => void;
}

export const UserFilterAutocomplete: React.FC<Props> = React.memo(({
    users, loadingUsers, selectedUser, traceFlagOperations, onUserChange, onInputChange, onStartLogging, onStopLogging
}) => {
    const formatExpirationTime = (expirationDate: string) => {
        if (!expirationDate) return '';
        try {
            const expDate = new Date(expirationDate);
            const diffMs = expDate.getTime() - new Date().getTime();
            if (diffMs <= 0) return 'Expired';
            const diffMinutes = Math.floor(diffMs / 60000);
            return diffMinutes >= 60 ? `Expires in ${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m` : `Expires in ${diffMinutes}m`;
        } catch {
            return 'Invalid date';
        }
    };

    const options = useMemo(() => [
        { Id: 'all', Name: 'All Users' },
        ...(selectedUser && selectedUser.Id !== 'all' && selectedUser.Id !== 'current' && !users.some(u => u.Id === selectedUser.Id) ? [selectedUser] : []),
        ...users,
    ], [users, selectedUser]);

    return (
        <Autocomplete
            sx={{ width: '20rem', height: '100%' }}
            options={options}
            getOptionLabel={(option) => option.Name}
            isOptionEqualToValue={(option, value) => option.Id === value.Id}
            loading={loadingUsers}
            loadingText="Searching..."
            value={selectedUser}
            onChange={onUserChange}
            onInputChange={(_, newInputValue) => { if (newInputValue && newInputValue.length > 1) onInputChange(newInputValue); }}
            filterOptions={(x) => x}
            noOptionsText="Type to search users..."
            renderOption={(props, option) => (
                <li {...props}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="body1">{option.Name}</Typography>
                            {option.Id !== 'all' && 'Username' in option && (
                                <Typography variant="caption" color="text.secondary">{(option as User).Username}</Typography>
                            )}
                            {option.Id !== 'all' && 'TraceFlagActive' in option && (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                                    <Typography variant="caption" color={(option as User).TraceFlagActive ? 'success.main' : 'text.disabled'}>
                                        {(option as User).TraceFlagActive ? '● Logging Active' : '○ Logging Inactive'}
                                    </Typography>
                                    {(option as User).TraceFlagActive && (option as User).TraceFlagExpirationDate && (
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                            {formatExpirationTime((option as User).TraceFlagExpirationDate!)}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Box>
                        {option.Id !== 'all' && 'TraceFlagActive' in option && (
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                {(option as User).TraceFlagActive ? (
                                    <Tooltip title="Stop logging for this user">
                                        <IconButton size="small" color="error" disabled={traceFlagOperations.has(option.Id)}
                                            onClick={(e) => { e.stopPropagation(); onStopLogging(option.Id, (option as User).TraceFlagId || ''); }}>
                                            {traceFlagOperations.has(option.Id) ? <CircularProgress size={16} /> : <StopIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                ) : (
                                    <Tooltip title="Start logging for this user">
                                        <IconButton size="small" color="success" disabled={traceFlagOperations.has(option.Id)}
                                            onClick={(e) => { e.stopPropagation(); onStartLogging(option.Id); }}>
                                            {traceFlagOperations.has(option.Id) ? <CircularProgress size={16} /> : <PlayArrowIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        )}
                    </Box>
                </li>
            )}
            renderInput={(params) => (
                <TextField {...params} label="Filter by User" placeholder="Start typing..." variant="outlined" size="small"
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            startAdornment: <FilterListIcon fontSize="small" sx={{ mr: 0.5, color: 'action.active' }} />,
                            endAdornment: <>{loadingUsers && <CircularProgress size={20} />}{params.InputProps.endAdornment}</>,
                        }
                    }}
                />
            )}
        />
    );
});

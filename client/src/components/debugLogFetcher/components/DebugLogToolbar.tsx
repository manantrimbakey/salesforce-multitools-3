import { Grid, IconButton, Tooltip, Divider, TextField, InputAdornment } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { UserFilterAutocomplete } from './UserFilterAutocomplete';
import type { User } from '../types';

interface Props {
    users: User[];
    loadingUsers: boolean;
    loading: boolean;
    deleting: boolean;
    selectedUser: User | { Id: string; Name: string } | null;
    traceFlagOperations: Set<string>;
    logSize: string;
    logSizeDirection: 'above' | 'below';
    onUserChange: (event: React.SyntheticEvent, newValue: User | { Id: string; Name: string } | null) => void;
    onInputChange: (newInputValue: string) => void;
    onStartLogging: (userId: string) => void;
    onStopLogging: (userId: string, traceFlagId: string) => void;
    onRefresh: () => void;
    onDeleteSelected: () => void;
    onDeleteAll: () => void;
    onLogSizeChange: (value: string) => void;
    onLogSizeDirectionChange: (direction: 'above' | 'below') => void;
}

export const DebugLogToolbar: React.FC<Props> = ({
    users, loadingUsers, loading, deleting, selectedUser, traceFlagOperations,
    logSize, logSizeDirection,
    onUserChange, onInputChange, onStartLogging, onStopLogging,
    onRefresh, onDeleteSelected, onDeleteAll, onLogSizeChange, onLogSizeDirectionChange
}) => {
    return (
        <Grid sx={{ p: '1rem', justifyContent: 'center', alignItems: 'center' }} container spacing={1}>
            <Grid sx={{ height: '100%' }}>
                <UserFilterAutocomplete
                    users={users}
                    loadingUsers={loadingUsers}
                    selectedUser={selectedUser}
                    traceFlagOperations={traceFlagOperations}
                    onUserChange={onUserChange}
                    onInputChange={onInputChange}
                    onStartLogging={onStartLogging}
                    onStopLogging={onStopLogging}
                />
            </Grid>
            <Grid sx={{ height: '100%' }}>
                <Tooltip title="Refresh logs">
                    <IconButton sx={{ height: '100%' }} onClick={onRefresh} disabled={loading}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Grid>
            <Divider orientation="vertical" flexItem />
            <Grid sx={{ height: '100%' }}>
                <Tooltip title="Delete logs for selected user">
                    <IconButton
                        color="error"
                        size="small"
                        disabled={loading || deleting || !selectedUser || selectedUser.Id === 'all'}
                        onClick={onDeleteSelected}
                        sx={{ backgroundColor: 'error.main', color: 'common.white', borderRadius: 1, '&:hover': { backgroundColor: 'error.dark' }, boxShadow: 1, height: '100%' }}
                    >
                        <PersonRemoveIcon />
                    </IconButton>
                </Tooltip>
            </Grid>
            <Grid sx={{ height: '100%' }}>
                <Tooltip title="Delete all logs">
                    <IconButton
                        color="error"
                        size="small"
                        disabled={loading || deleting}
                        onClick={onDeleteAll}
                        sx={{ backgroundColor: 'error.main', color: 'common.white', borderRadius: 1, '&:hover': { backgroundColor: 'error.dark' }, boxShadow: 1, height: '100%' }}
                    >
                        <DeleteSweepIcon />
                    </IconButton>
                </Tooltip>
            </Grid>
            <Divider orientation="vertical" flexItem />
            <Grid sx={{ flexGrow: 1, height: '100%' }}></Grid>
            <Grid sx={{ height: '100%' }}>
                <TextField
                    sx={{ height: '100%' }}
                    label="Log Size (bytes)"
                    type="number"
                    size="small"
                    value={logSize}
                    onChange={(e) => onLogSizeChange(e.target.value)}
                    slotProps={{
                        input: {
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Tooltip title={logSizeDirection === 'above' ? 'Show logs larger than this size' : 'Show logs smaller than this size'}>
                                        <IconButton size="small" onClick={() => onLogSizeDirectionChange(logSizeDirection === 'above' ? 'below' : 'above')} edge="end">
                                            {logSizeDirection === 'above' ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                        </IconButton>
                                    </Tooltip>
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </Grid>
        </Grid>
    );
};

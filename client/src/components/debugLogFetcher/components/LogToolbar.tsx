import { Box, CircularProgress, Divider, Typography } from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';
import type { DebugLevel, SfUser, SizeDirection } from '../../../api/client';
import { hasRealUserId } from '../utils/user';
import type { UserOption } from '../utils/user';
import { DebugLevelSelect } from './DebugLevelSelect';
import { ExpirationText } from './ExpirationText';
import { LogSizeFilter } from './LogSizeFilter';
import { ToolbarIconButton } from './ToolbarIconButton';
import { UserPicker } from './UserPicker';

interface Props {
    users: SfUser[];
    selected: UserOption;
    loadingUsers: boolean;
    busy: boolean; // logs loading or deleting
    traceFlagPending: ReadonlySet<string>;
    debugLevels: DebugLevel[];
    debugLevelId: string;
    loadingDebugLevels: boolean;
    logSize: string;
    logSizeDirection: SizeDirection;
    onSelectUser: (option: UserOption) => void;
    onSearchUsers: (term: string) => void;
    onRefresh: () => void;
    onDeleteForUser: () => void;
    onDeleteAll: () => void;
    onDebugLevelChange: (id: string) => void;
    onStartLogging: (user: SfUser) => void;
    onStopLogging: (user: SfUser) => void;
    onLogSizeChange: (value: string) => void;
    onLogSizeDirectionChange: (direction: SizeDirection) => void;
}

export function LogToolbar(props: Props) {
    const { selected, busy, traceFlagPending } = props;
    const user = selected.kind === 'user' ? selected.user : null;
    const traceBusy = user !== null && traceFlagPending.has(user.Id);
    const canTrace = user !== null && hasRealUserId(user);

    return (
        <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            <UserPicker
                users={props.users}
                selected={selected}
                loading={props.loadingUsers}
                onSelect={props.onSelectUser}
                onSearch={props.onSearchUsers}
            />

            <ToolbarIconButton title="Refresh logs" onClick={props.onRefresh} disabled={busy}>
                <RefreshIcon />
            </ToolbarIconButton>

            <Divider orientation="vertical" flexItem />

            <ToolbarIconButton
                title="Delete logs for selected user"
                color="error"
                filled
                disabled={busy || user === null}
                onClick={props.onDeleteForUser}
            >
                <PersonRemoveIcon />
            </ToolbarIconButton>
            <ToolbarIconButton title="Delete all logs" color="error" filled disabled={busy} onClick={props.onDeleteAll}>
                <DeleteSweepIcon />
            </ToolbarIconButton>

            {user && (
                <>
                    <Divider orientation="vertical" flexItem />
                    {user.TraceFlagActive ? (
                        <ToolbarIconButton
                            title={
                                canTrace ? `Stop logging for ${user.Name}` : 'Logging cannot be managed for this user'
                            }
                            color="error"
                            filled
                            disabled={!canTrace || !user.TraceFlagId || traceBusy}
                            onClick={() => props.onStopLogging(user)}
                        >
                            {traceBusy ? <CircularProgress size={18} color="inherit" /> : <StopIcon />}
                        </ToolbarIconButton>
                    ) : (
                        <>
                            <DebugLevelSelect
                                levels={props.debugLevels}
                                value={props.debugLevelId}
                                loading={props.loadingDebugLevels}
                                disabled={!canTrace || traceBusy}
                                onChange={props.onDebugLevelChange}
                            />
                            <ToolbarIconButton
                                title={
                                    canTrace
                                        ? `Start logging for ${user.Name}`
                                        : 'Logging cannot be managed for this user'
                                }
                                color="success"
                                filled
                                disabled={!canTrace || traceBusy}
                                onClick={() => props.onStartLogging(user)}
                            >
                                {traceBusy ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
                            </ToolbarIconButton>
                        </>
                    )}
                    {user.TraceFlagActive && user.TraceFlagDebugLevel && (
                        <Typography variant="caption" color="text.secondary" noWrap title="Debug level in use">
                            Level: {user.TraceFlagDebugLevel}
                        </Typography>
                    )}
                    {user.TraceFlagActive && user.TraceFlagExpirationDate && (
                        <ExpirationText
                            date={user.TraceFlagExpirationDate}
                            sx={{ fontSize: '0.7rem', fontWeight: 500, whiteSpace: 'nowrap' }}
                        />
                    )}
                </>
            )}

            <Box sx={{ flexGrow: 1 }} />

            <LogSizeFilter
                value={props.logSize}
                direction={props.logSizeDirection}
                onValueChange={props.onLogSizeChange}
                onDirectionChange={props.onLogSizeDirectionChange}
            />
        </Box>
    );
}

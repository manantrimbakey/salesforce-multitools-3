import { CircularProgress, FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import type { DebugLevel } from '../../../api/client';
import { DEFAULT_DEBUG_LEVEL_ID } from '../hooks/useDebugLevels';

interface Props {
    levels: DebugLevel[];
    value: string;
    loading: boolean;
    disabled?: boolean;
    onChange: (id: string) => void;
}

/** Picks the debug level a new trace flag will log at. */
export function DebugLevelSelect({ levels, value, loading, disabled, onChange }: Props) {
    return (
        <FormControl size="small" sx={{ minWidth: '11rem', maxWidth: '14rem' }} disabled={disabled}>
            <InputLabel id="debug-level-label" shrink>Debug level</InputLabel>
            <Select
                labelId="debug-level-label"
                label="Debug level"
                displayEmpty
                notched
                value={value}
                onChange={(event) => onChange(event.target.value)}
                endAdornment={loading ? <CircularProgress size={16} sx={{ mr: 3 }} /> : undefined}
                MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
            >
                <MenuItem value={DEFAULT_DEBUG_LEVEL_ID}>Default (Multitools)</MenuItem>
                {levels.map((level) => (
                    <MenuItem key={level.Id} value={level.Id} title={level.DeveloperName}>
                        {level.MasterLabel || level.DeveloperName}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

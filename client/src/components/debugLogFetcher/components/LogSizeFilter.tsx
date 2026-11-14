import { IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import type { SizeDirection } from '../../../api/client';

interface Props {
    value: string;
    direction: SizeDirection;
    onValueChange: (value: string) => void;
    onDirectionChange: (direction: SizeDirection) => void;
}

export function LogSizeFilter({ value, direction, onValueChange, onDirectionChange }: Props) {
    const label = direction === 'above' ? 'Show logs larger than this size' : 'Show logs smaller than this size';
    return (
        <TextField
            label="Log Size (bytes)"
            type="number"
            size="small"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            slotProps={{
                input: {
                    endAdornment: (
                        <InputAdornment position="end">
                            <Tooltip title={label}>
                                <IconButton
                                    size="small"
                                    edge="end"
                                    aria-label={label}
                                    onClick={() => onDirectionChange(direction === 'above' ? 'below' : 'above')}
                                >
                                    {direction === 'above' ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                </IconButton>
                            </Tooltip>
                        </InputAdornment>
                    ),
                },
            }}
        />
    );
}

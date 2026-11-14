import { Typography } from '@mui/material';
import type { TypographyProps } from '@mui/material';
import { useMinuteTick } from '../../../hooks/useMinuteTick';
import { formatExpirationTime } from '../utils/format';

interface Props extends Omit<TypographyProps, 'children'> {
    date: string;
}

/** Relative expiration text that re-renders every minute. */
export function ExpirationText({ date, ...rest }: Props) {
    const now = useMinuteTick();
    return (
        <Typography variant="caption" color="text.secondary" {...rest}>
            {formatExpirationTime(date, now)}
        </Typography>
    );
}

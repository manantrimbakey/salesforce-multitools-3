import { IconButton, Tooltip } from '@mui/material';
import type { IconButtonProps } from '@mui/material';

interface Props extends Omit<IconButtonProps, 'title' | 'color'> {
    title: string;
    color?: 'default' | 'error' | 'success';
    /** Solid background in the given color (used for destructive / primary toolbar actions). */
    filled?: boolean;
}

/** Icon button with a tooltip that keeps working (and stays labelled) while disabled. */
export function ToolbarIconButton({ title, color = 'default', filled = false, sx, children, ...rest }: Props) {
    const filledSx =
        filled && color !== 'default'
            ? {
                  backgroundColor: `${color}.main`,
                  color: 'common.white',
                  borderRadius: 1,
                  boxShadow: 1,
                  '&:hover': { backgroundColor: `${color}.dark` },
                  '&.Mui-disabled': { opacity: 0.5, color: 'common.white', backgroundColor: `${color}.main` },
              }
            : {};
    return (
        <Tooltip title={title}>
            <span>
                <IconButton aria-label={title} color={color} size="small" sx={{ ...filledSx, ...sx }} {...rest}>
                    {children}
                </IconButton>
            </span>
        </Tooltip>
    );
}

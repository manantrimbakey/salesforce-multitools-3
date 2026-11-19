import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { api, errorMessage } from '../../api/client';
import type { CompareContextResponse, CompareResponse } from '../../api/client';
import { DiffView } from './DiffView';
import { toSource } from './selection';
import type { SideSelection } from './selection';
import { SourcePanel } from './SourcePanel';

const emptySide = (kind: 'org' | 'branch', org = '', ref = ''): SideSelection => ({
    kind,
    org,
    ref,
    type: 'permissionset',
    item: null,
});

function describeSide(side: SideSelection, context: CompareContextResponse): string {
    const itemName = side.item?.name ?? '';
    if (side.kind === 'branch') {
        return `${itemName} @ ${side.ref === context.git.workingTreeRef ? 'working tree' : side.ref}`;
    }
    const org = context.orgs.find((candidate) => candidate.username === side.org);
    return `${itemName} @ ${org?.alias ?? side.org}`;
}

export default function PermissionCompare() {
    const [context, setContext] = useState<CompareContextResponse | null>(null);
    const [contextError, setContextError] = useState<string | null>(null);
    const [left, setLeft] = useState<SideSelection>(emptySide('org'));
    const [right, setRight] = useState<SideSelection>(emptySide('org'));
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{
        data: CompareResponse;
        leftLabel: string;
        rightLabel: string;
        mixed: boolean;
    } | null>(null);

    useEffect(() => {
        api.getCompareContext()
            .then((response) => {
                setContext(response);
                const defaultOrg =
                    response.orgs.find((org) => org.isDefault)?.username ?? response.orgs[0]?.username ?? '';
                // Sensible start: working tree (retrieved files) on the left, the default org on the right
                setLeft(
                    response.git.available
                        ? emptySide('branch', defaultOrg, response.git.workingTreeRef)
                        : emptySide('org', defaultOrg),
                );
                setRight(emptySide('org', defaultOrg));
            })
            .catch((e: unknown) => setContextError(errorMessage(e)));
    }, []);

    if (contextError) {
        return <Alert severity="error">{contextError}</Alert>;
    }
    if (!context) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                <CircularProgress size={24} aria-label="Loading" />
            </Box>
        );
    }

    const ready = !!(left.item && right.item && toSource(left) && toSource(right));

    const swap = () => {
        setLeft(right);
        setRight(left);
        setResult(null);
    };

    const run = async () => {
        const leftSource = toSource(left);
        const rightSource = toSource(right);
        if (!left.item || !right.item || !leftSource || !rightSource) return;
        setRunning(true);
        setError(null);
        try {
            const data = await api.compare(
                { source: leftSource, item: { type: left.item.type, id: left.item.id } },
                { source: rightSource, item: { type: right.item.type, id: right.item.id } },
            );
            setResult({
                data,
                leftLabel: describeSide(left, context),
                rightLabel: describeSide(right, context),
                mixed: left.kind !== right.kind,
            });
        } catch (e) {
            setResult(null);
            setError(errorMessage(e));
        } finally {
            setRunning(false);
        }
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
            <Stack direction="row" spacing={1} alignItems="stretch" flexWrap="wrap" useFlexGap>
                <SourcePanel
                    title="Base"
                    context={context}
                    value={left}
                    onChange={setLeft}
                    suggestName={right.item?.name}
                />
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Tooltip title="Swap sides">
                        <IconButton onClick={swap} aria-label="Swap sides" size="small">
                            ⇄
                        </IconButton>
                    </Tooltip>
                </Box>
                <SourcePanel
                    title="Compare to"
                    context={context}
                    value={right}
                    onChange={setRight}
                    suggestName={left.item?.name}
                />
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center">
                <Button variant="contained" disabled={!ready || running} onClick={run}>
                    {running ? 'Comparing…' : 'Compare'}
                </Button>
                {running && <CircularProgress size={18} aria-label="Comparing" />}
                {!ready && (
                    <Typography variant="caption" color="text.secondary">
                        Pick a source and a permission set or profile on both sides.
                    </Typography>
                )}
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}
            {result && [...(result.data.left.warnings ?? []), ...(result.data.right.warnings ?? [])].length > 0 && (
                <Alert severity="warning" sx={{ py: 0 }}>
                    {[...(result.data.left.warnings ?? []), ...(result.data.right.warnings ?? [])].map((warning) => (
                        <Box key={warning} sx={{ wordBreak: 'break-word' }}>
                            {warning}
                        </Box>
                    ))}
                </Alert>
            )}
            {result && (
                <DiffView
                    key={`${result.leftLabel}|${result.rightLabel}`}
                    result={result.data}
                    leftLabel={result.leftLabel}
                    rightLabel={result.rightLabel}
                    mixedSources={result.mixed}
                />
            )}
        </Box>
    );
}

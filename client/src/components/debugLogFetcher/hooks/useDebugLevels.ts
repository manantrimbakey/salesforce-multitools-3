import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import type { DebugLevel } from '../../../api/client';
import { vscode } from '../../../vscodeApi';

/** Selection meaning "use the extension's default debug level". */
export const DEFAULT_DEBUG_LEVEL_ID = '';

const STATE_KEY = 'debugLevelId';

function readSavedLevelId(): string {
    const state = vscode.getState();
    const saved =
        typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[STATE_KEY] : undefined;
    return typeof saved === 'string' ? saved : DEFAULT_DEBUG_LEVEL_ID;
}

function saveLevelId(id: string): void {
    const state = vscode.getState();
    vscode.setState({ ...(typeof state === 'object' && state !== null ? state : {}), [STATE_KEY]: id });
}

/**
 * The org's debug levels plus the user's choice, which is remembered between sessions.
 * A saved level that no longer exists in the org falls back to the default.
 */
export function useDebugLevels(onError: (message: string) => void) {
    const [levels, setLevels] = useState<DebugLevel[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(readSavedLevelId);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.getDebugLevels()
            .then((response) => {
                if (!cancelled) setLevels(response.debugLevels ?? []);
            })
            .catch((e) => {
                if (!cancelled) onError(`Failed to load debug levels: ${errorMessage(e)}`);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [onError]);

    const select = useCallback((id: string) => {
        setSelectedId(id);
        saveLevelId(id);
    }, []);

    const selected = useMemo(() => levels.find((level) => level.Id === selectedId), [levels, selectedId]);

    return {
        levels,
        loading,
        /** Id to show in the picker; unknown / stale ids show the default. */
        selectedId: selected ? selected.Id : DEFAULT_DEBUG_LEVEL_ID,
        /** The chosen org level, or undefined for the default level. */
        selected,
        select,
    };
}

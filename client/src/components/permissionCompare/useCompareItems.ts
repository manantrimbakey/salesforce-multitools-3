import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { CompareSource, PermissionItemOption, PermissionItemType } from '../../api/client';

export interface CompareItemsState {
    items: PermissionItemOption[];
    loading: boolean;
    error: string | null;
}

/** Items (permission sets / profiles) available in a source; reloads when the source or kind changes. */
export function useCompareItems(source: CompareSource | null, type: PermissionItemType): CompareItemsState {
    const [state, setState] = useState<CompareItemsState>({ items: [], loading: false, error: null });
    const sourceKey = source ? (source.kind === 'org' ? `org:${source.username}` : `branch:${source.ref}`) : '';

    useEffect(() => {
        if (!source) {
            setState({ items: [], loading: false, error: null });
            return;
        }
        let cancelled = false;
        setState({ items: [], loading: true, error: null });
        api.getCompareItems(source, type)
            .then((response) => {
                if (!cancelled) setState({ items: response.items, loading: false, error: null });
            })
            .catch((error: unknown) => {
                if (!cancelled) setState({ items: [], loading: false, error: errorMessage(error) });
            });
        return () => {
            cancelled = true;
        };
        // `source` is identified by sourceKey; the object itself is recreated on every render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceKey, type]);

    return state;
}

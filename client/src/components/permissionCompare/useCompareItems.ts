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
    const sourceKey = source ? (source.kind === 'org' ? `org:${source.username}` : `branch:${source.ref}`) : '';
    const listKey = `${sourceKey}|${type}`;
    const [loaded, setState] = useState<CompareItemsState & { key: string }>({
        items: [],
        loading: false,
        error: null,
        key: '',
    });

    useEffect(() => {
        if (!source) {
            setState({ items: [], loading: false, error: null, key: listKey });
            return;
        }
        let cancelled = false;
        setState({ items: [], loading: true, error: null, key: listKey });
        api.getCompareItems(source, type)
            .then((response) => {
                if (!cancelled) setState({ items: response.items, loading: false, error: null, key: listKey });
            })
            .catch((error: unknown) => {
                if (!cancelled) setState({ items: [], loading: false, error: errorMessage(error), key: listKey });
            });
        return () => {
            cancelled = true;
        };
        // `source` is identified by sourceKey; the object itself is recreated on every render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceKey, type]);

    // Right after the source changes the state still holds the previous source's items for one render. Handing those
    // out would let a stale item (an Id of another org, a file of another branch) be auto-selected for the new source.
    if (loaded.key !== listKey) {
        return { items: [], loading: !!source, error: null };
    }
    return { items: loaded.items, loading: loaded.loading, error: loaded.error };
}

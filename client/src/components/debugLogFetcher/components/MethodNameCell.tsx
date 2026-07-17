import { useState, useEffect, useRef } from 'react';
import { CircularProgress, Tooltip } from '@mui/material';
import { callHost } from '../../../vscode/messenger';
import { methodPool } from './promisePool';

interface MethodNameCache {
    [logId: string]: { methodName: string; timestamp: number; };
}

const methodNameCache: MethodNameCache = {};
const CACHE_TTL = 30 * 60 * 1000;

export function MethodNameCell({ logId }: { logId: string }) {
    const [methodName, setMethodName] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLSpanElement | null>(null);
    const hasFetched = useRef(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && !hasFetched.current) {
                    hasFetched.current = true;
                    fetchMethodName();
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(node);
        return () => observer.unobserve(node);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logId]);

    const fetchMethodName = () => {
        const cached = methodNameCache[logId];
        const now = Date.now();
        if (cached && now - cached.timestamp < CACHE_TTL) {
            setMethodName(cached.methodName);
            return;
        }

        setLoading(true);
        methodPool.run(async () => {
            try {
                const response = await callHost('debugLogs:methodName', { logId });
                setMethodName(response.methodName);
                methodNameCache[logId] = { methodName: response.methodName, timestamp: Date.now() };
            } catch {
                setError('Error fetching method name');
                methodNameCache[logId] = { methodName: 'TIMEOUT', timestamp: Date.now() };
            } finally {
                setLoading(false);
            }
        });
    };

    if (loading) return <CircularProgress size={16} />;
    if (error) return <Tooltip title={error}><span>Error</span></Tooltip>;
    
    return (
        <Tooltip title={methodName || 'No method found'}>
            <span ref={ref} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {methodName || 'N/A'}
            </span>
        </Tooltip>
    );
}

import { useEffect, useRef, useState } from 'react';

import { getGlobalDB } from './globalDB';

export type DuckDBStatus = 'initializing' | 'ready' | 'error';

/** Initializes the singleton DuckDB once and reports its lifecycle status. */
export function useDuckDB(): { status: DuckDBStatus; error?: string } {
    const [status, setStatus] = useState<DuckDBStatus>('initializing');
    const [error, setError] = useState<string>();
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        getGlobalDB()
            .then(() => setStatus('ready'))
            .catch(e => {
                setError(e instanceof Error ? e.message : String(e));
                setStatus('error');
            });
    }, []);

    return { status, error };
}

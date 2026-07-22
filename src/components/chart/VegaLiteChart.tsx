import { useMemo } from 'react';
import { VegaLite } from 'react-vega';
import { loader as vegaLoader, type Loader } from 'vega';
import type { TopLevelSpec } from 'vega-lite';

import { executeQuery } from '@/lib/duckdb/db';

/**
 * A Vega Loader that intercepts `duckdb://<table>` URLs and resolves them by
 * running `SELECT * FROM "<table>"` against DuckDB, returning JSON rows. All
 * other URLs fall through to Vega's default loader.
 */
export function createDuckDBLoader(): Loader {
    const base = vegaLoader();
    return {
        ...base,
        load: async (uri: string, options?: unknown) => {
            if (uri.startsWith('duckdb://')) {
                const table = uri.slice('duckdb://'.length);
                const res = await executeQuery(`SELECT * FROM "${table}"`);
                return JSON.stringify(res.rows);
            }
            return base.load(uri, options as never);
        },
        sanitize: async (uri: string, options: unknown) => {
            if (uri.startsWith('duckdb://')) return { href: uri };
            return base.sanitize(uri, options as never);
        },
    };
}

interface VegaLiteChartProps {
    spec: TopLevelSpec;
}

export function VegaLiteChart({ spec }: VegaLiteChartProps) {
    const loader = useMemo(() => createDuckDBLoader(), []);
    return <VegaLite spec={spec} actions={false} loader={loader} style={{ width: '100%', height: '100%' }} />;
}

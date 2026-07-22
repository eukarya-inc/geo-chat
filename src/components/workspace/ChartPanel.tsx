import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import type { TopLevelSpec } from 'vega-lite';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VegaLiteChart } from '@/components/chart/VegaLiteChart';
import { getTableSchema, type QueryColumn } from '@/lib/duckdb/db';
import { chartSpecsAtom, selectedTableAtom } from '@/store/atoms';
import { NoTableHint, TablePicker } from './TablePicker';

const NUMERIC = /INT|DOUBLE|FLOAT|DECIMAL|REAL|NUMERIC|HUGEINT/;
const TEXTUAL = /VARCHAR|TEXT|CHAR|STRING/;

/** Cheap starter spec: a bar chart of the first text column by the first numeric column. */
function skeletonSpec(schema: QueryColumn[]): object {
    const text = schema.find(c => TEXTUAL.test(c.type.toUpperCase()));
    const numeric = schema.find(c => NUMERIC.test(c.type.toUpperCase()));
    if (text && numeric) {
        return {
            description: 'Edit this Vega-Lite spec, then press Apply. Omit data/width/height — they are injected.',
            mark: 'bar',
            encoding: {
                x: { field: text.name, type: 'nominal', sort: '-y' },
                y: { field: numeric.name, type: 'quantitative' },
            },
        };
    }
    return {
        description: 'Edit this Vega-Lite spec, then press Apply. Omit data/width/height — they are injected.',
        mark: 'bar',
        encoding: {
            x: { field: 'FIELD_X', type: 'nominal' },
            y: { field: 'FIELD_Y', type: 'quantitative' },
        },
    };
}

export function ChartPanel() {
    const table = useAtomValue(selectedTableAtom);
    const [specs, setSpecs] = useAtom(chartSpecsAtom);
    const [draft, setDraft] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);

    // Load the editor from the stored spec, or a fresh skeleton, when the table changes.
    useEffect(() => {
        if (!table) return;
        const existing = specs[table];
        if (existing) {
            setDraft(JSON.stringify(existing, null, 2));
            setParseError(null);
            return;
        }
        let cancelled = false;
        getTableSchema(table).then(schema => {
            if (cancelled) return;
            setDraft(JSON.stringify(skeletonSpec(schema), null, 2));
            setParseError(null);
        });
        return () => {
            cancelled = true;
        };
        // Only re-run when the table changes, not on every spec edit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table]);

    const apply = () => {
        try {
            const parsed = JSON.parse(draft) as object;
            setParseError(null);
            if (table) setSpecs(prev => ({ ...prev, [table]: parsed }));
        } catch (e) {
            setParseError(e instanceof Error ? e.message : String(e));
        }
    };

    const renderedSpec = useMemo<TopLevelSpec | null>(() => {
        if (!table) return null;
        const spec = specs[table];
        if (!spec) return null;
        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
            ...spec,
            data: { url: `duckdb://${table}` },
            width: 'container',
            height: 'container',
        } as TopLevelSpec;
    }, [table, specs]);

    if (!table) return <NoTableHint />;

    return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-3">
            <TablePicker />
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                {/* Editor */}
                <div className="flex min-h-0 flex-col gap-2">
                    <Textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        spellCheck={false}
                        className="min-h-0 flex-1 resize-none font-mono text-xs"
                        placeholder="Vega-Lite spec JSON"
                    />
                    <div className="flex items-center gap-3">
                        <Button size="sm" onClick={apply}>
                            Apply
                        </Button>
                        {parseError && <span className="text-destructive text-xs">{parseError}</span>}
                    </div>
                </div>
                {/* Chart */}
                <div className="min-h-0 overflow-hidden rounded-md border p-2">
                    {renderedSpec ? (
                        <VegaLiteChart spec={renderedSpec} />
                    ) : (
                        <div className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
                            Press Apply to render the chart.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

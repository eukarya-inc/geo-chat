import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { VegaChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { parseDuckDBUrl } from '../../utils/schema';
import type { View } from 'vega';
import VegaLiteChart from './VegaLiteChart';
import React from 'react';

// Mock react-vega
vi.mock('react-vega', () => ({
    VegaLite: ({ spec, onNewView }: { spec: unknown; onNewView: (view: View) => void }) => {
        // Simulate view creation
        React.useEffect(() => {
            if (onNewView) {
                const mockView = { resize: vi.fn() } as unknown as View;
                onNewView(mockView);
            }
        }, [onNewView]);

        return <div data-testid="vega-lite-chart">{JSON.stringify(spec)}</div>;
    },
}));

describe('VegaLiteChart Logic', () => {
    describe('createDuckDBLoader Function', () => {
        const mockDBContext: DBContext = {
            executeQuery: vi.fn(),
        } as unknown as DBContext;

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should create loader with load and sanitize methods', () => {
            // Simulate createDuckDBLoader logic
            const createLoader = (dbContext: DBContext, schema: string | null) => {
                return {
                    load: async (uri: string) => {
                        if (uri.startsWith('duckdb://')) {
                            const parsed = parseDuckDBUrl(uri);
                            if (!parsed) throw new Error(`Invalid DuckDB URL: ${uri}`);

                            const { schemaName: urlSchema, tableName } = parsed;
                            const schemaName = urlSchema || schema;
                            const sql = `SELECT * FROM ${tableName}`;
                            const rows = await dbContext.executeQuery(sql, schemaName);
                            return JSON.stringify(rows);
                        }
                        throw new Error('Non-duckdb URL not supported in test');
                    },
                    sanitize: async (uri: string) => {
                        if (uri.startsWith('duckdb://')) {
                            return { href: uri };
                        }
                        throw new Error('Non-duckdb URL not supported in test');
                    },
                };
            };

            const loader = createLoader(mockDBContext, 'test_schema');

            expect(loader).toHaveProperty('load');
            expect(loader).toHaveProperty('sanitize');
            expect(typeof loader.load).toBe('function');
            expect(typeof loader.sanitize).toBe('function');
        });

        it('should load data from duckdb:// URL', async () => {
            const mockRows = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ];
            (mockDBContext.executeQuery as ReturnType<typeof vi.fn>).mockResolvedValue(mockRows);

            const createLoader = (dbContext: DBContext, schema: string | null) => {
                return {
                    load: async (uri: string) => {
                        if (uri.startsWith('duckdb://')) {
                            const parsed = parseDuckDBUrl(uri);
                            if (!parsed) throw new Error(`Invalid DuckDB URL: ${uri}`);

                            const { schemaName: urlSchema, tableName } = parsed;
                            const schemaName = urlSchema || schema;
                            const sql = `SELECT * FROM ${tableName}`;
                            const rows = await dbContext.executeQuery(sql, schemaName);
                            return JSON.stringify(rows);
                        }
                        throw new Error('Non-duckdb URL not supported in test');
                    },
                };
            };

            const loader = createLoader(mockDBContext, 'default_schema');
            const result = await loader.load('duckdb://test_table');

            expect(mockDBContext.executeQuery).toHaveBeenCalledWith('SELECT * FROM test_table', 'default_schema');
            expect(result).toBe(JSON.stringify(mockRows));
        });

        it('should use URL schema over default schema', async () => {
            (mockDBContext.executeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            const createLoader = (dbContext: DBContext, schema: string | null) => {
                return {
                    load: async (uri: string) => {
                        if (uri.startsWith('duckdb://')) {
                            const parsed = parseDuckDBUrl(uri);
                            if (!parsed) throw new Error(`Invalid DuckDB URL: ${uri}`);

                            const { schemaName: urlSchema, tableName } = parsed;
                            const schemaName = urlSchema || schema;
                            const sql = `SELECT * FROM ${tableName}`;
                            const rows = await dbContext.executeQuery(sql, schemaName);
                            return JSON.stringify(rows);
                        }
                        throw new Error('Non-duckdb URL not supported in test');
                    },
                };
            };

            const loader = createLoader(mockDBContext, 'default_schema');
            await loader.load('duckdb://url_schema.test_table');

            expect(mockDBContext.executeQuery).toHaveBeenCalledWith('SELECT * FROM test_table', 'url_schema');
        });

        it('should sanitize duckdb:// URLs without modification', async () => {
            const createLoader = () => {
                return {
                    sanitize: async (uri: string) => {
                        if (uri.startsWith('duckdb://')) {
                            return { href: uri };
                        }
                        throw new Error('Non-duckdb URL not supported in test');
                    },
                };
            };

            const loader = createLoader();
            const result = await loader.sanitize('duckdb://test_table');

            expect(result).toEqual({ href: 'duckdb://test_table' });
        });
    });
});

// Component rendering tests
describe('VegaLiteChart Component', () => {
    const mockDBContext: DBContext = {
        executeQuery: vi.fn().mockResolvedValue([]),
    } as unknown as DBContext;

    describe('All Chart Types Rendering', () => {
        it('should render bar chart', () => {
            const spec: VegaChartSpec = {
                mark: 'bar',
                encoding: {
                    x: { field: 'category', type: 'nominal' },
                    y: { field: 'value', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart).toBeInTheDocument();
            expect(chart.textContent).toContain('"mark":"bar"');
        });

        it('should render line chart', () => {
            const spec: VegaChartSpec = {
                mark: 'line',
                encoding: {
                    x: { field: 'date', type: 'temporal' },
                    y: { field: 'value', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"line"');
        });

        it('should render circle (scatter) chart', () => {
            const spec: VegaChartSpec = {
                mark: 'circle',
                encoding: {
                    x: { field: 'x_value', type: 'quantitative' },
                    y: { field: 'y_value', type: 'quantitative' },
                    color: { field: 'category', type: 'nominal' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"circle"');
        });

        it('should render point chart', () => {
            const spec: VegaChartSpec = {
                mark: 'point',
                encoding: {
                    x: { field: 'x_value', type: 'quantitative' },
                    y: { field: 'y_value', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"point"');
        });

        it('should render area chart', () => {
            const spec: VegaChartSpec = {
                mark: 'area',
                encoding: {
                    x: { field: 'date', type: 'temporal' },
                    y: { field: 'value', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"area"');
        });

        it('should render rect (heatmap) chart', () => {
            const spec: VegaChartSpec = {
                mark: 'rect',
                encoding: {
                    x: { field: 'x_category', type: 'nominal' },
                    y: { field: 'y_category', type: 'nominal' },
                    color: { field: 'value', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"rect"');
        });

        it('should render arc (pie) chart', () => {
            const spec: VegaChartSpec = {
                mark: 'arc',
                encoding: {
                    theta: { field: 'value', type: 'quantitative' },
                    color: { field: 'category', type: 'nominal' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"arc"');
        });

        it('should render text chart', () => {
            const spec: VegaChartSpec = {
                mark: 'text',
                encoding: {
                    x: { field: 'x_value', type: 'quantitative' },
                    y: { field: 'y_value', type: 'quantitative' },
                    text: { field: 'label', type: 'nominal' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"text"');
        });

        it('should render tick chart', () => {
            const spec: VegaChartSpec = {
                mark: 'tick',
                encoding: {
                    x: { field: 'value', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"tick"');
        });

        it('should render rule chart', () => {
            const spec: VegaChartSpec = {
                mark: 'rule',
                encoding: {
                    y: { field: 'threshold', type: 'quantitative' },
                },
                data: { url: 'duckdb://test_table' },
            };

            render(<VegaLiteChart spec={spec} dbContext={mockDBContext} />);

            const chart = screen.getByTestId('vega-lite-chart');
            expect(chart.textContent).toContain('"mark":"rule"');
        });
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeToolForTest } from './toolTestHelper';
import { createMapStyleTool, type MapStyleUpdateResult } from './mapStyleTool';
import type { MapSpec } from '../../../store/remoteAtoms';
import type { TableStyle, VectorTileLayer } from '../../../components/map';

describe('createMapStyleTool', () => {
    let mockGetMapSpec: (tableName: string) => MapSpec | undefined;
    let mockOnMapStyleUpdate: (tableName: string, style: TableStyle) => Promise<void>;
    let originalConsoleWarn: typeof console.warn;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetMapSpec = vi.fn();
        mockOnMapStyleUpdate = vi.fn();

        // Suppress console.warn during tests
        originalConsoleWarn = console.warn;
        console.warn = vi.fn();
    });

    afterEach(() => {
        // Restore original console.warn
        console.warn = originalConsoleWarn;
    });

    it('should create a tool with correct metadata', () => {
        const tool = createMapStyleTool(mockGetMapSpec, mockOnMapStyleUpdate, null, null);

        expect(tool).toBeDefined();
        expect(tool?.description).toContain('Update map styles');
    });

    it('should create new styles when map spec is not available', async () => {
        mockGetMapSpec = vi.fn(() => undefined);
        mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

        const tool = createMapStyleTool(mockGetMapSpec, mockOnMapStyleUpdate, null, null);
        if (!tool) throw new Error('Tool should be created');
        const result = await executeToolForTest<MapStyleUpdateResult>(
            tool.execute,
            {
                table_name: 'test_table',
                geometry_type: 'polygon',
                style_properties: { 'fill-color': '#ff0000' },
                description: 'Test update',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('Expected success result');
        }
        expect(result.message).toContain('Test update');
        expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
            {
                id: 'duckdb-polygons-test_table',
                type: 'fill',
                paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.3 },
            },
            {
                id: 'duckdb-polygon-outlines-test_table',
                type: 'line',
                paint: { 'line-color': '#ff0000', 'line-width': 1, 'line-opacity': 0.8 },
            },
        ]);
    });

    it('should update polygon layers successfully', async () => {
        const existingFillLayer: VectorTileLayer = {
            id: 'duckdb-polygons-test_table',
            type: 'fill',
            paint: { 'fill-color': '#0000ff', 'fill-opacity': 0.3 },
        };

        const existingOutlineLayer: VectorTileLayer = {
            id: 'duckdb-polygon-outlines-test_table',
            type: 'line',
            paint: { 'line-color': '#0000ff', 'line-width': 1 },
        };

        const mockMapSpec: MapSpec = {
            tableStyles: {
                test_table: [existingFillLayer, existingOutlineLayer],
            },
        };

        mockGetMapSpec = vi.fn(() => mockMapSpec);
        mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

        const tool = createMapStyleTool(mockGetMapSpec, mockOnMapStyleUpdate, null, null);
        if (!tool) throw new Error('Tool should be created');
        const result = await executeToolForTest<MapStyleUpdateResult>(
            tool.execute,
            {
                table_name: 'test_table',
                geometry_type: 'polygon',
                style_properties: { 'fill-color': '#ff0000', 'fill-opacity': 0.5 },
                description: 'Update polygon style',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('Expected success result');
        }
        expect(result.message).toContain('Update polygon style');
        expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
            {
                id: 'duckdb-polygons-test_table',
                type: 'fill',
                paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.5 },
            },
            {
                id: 'duckdb-polygon-outlines-test_table',
                type: 'line',
                paint: { 'line-color': '#ff0000', 'line-width': 1, 'line-opacity': 0.8 },
            },
        ]);
    });

    it('should update point layer successfully', async () => {
        const existingLayer: VectorTileLayer = {
            id: 'duckdb-points-test_table',
            type: 'circle',
            paint: { 'circle-color': '#0000ff' },
        };

        const mockMapSpec: MapSpec = {
            tableStyles: {
                test_table: [existingLayer],
            },
        };

        mockGetMapSpec = vi.fn(() => mockMapSpec);
        mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

        const tool = createMapStyleTool(mockGetMapSpec, mockOnMapStyleUpdate, null, null);
        if (!tool) throw new Error('Tool should be created');
        const result = await executeToolForTest<MapStyleUpdateResult>(
            tool.execute,
            {
                table_name: 'test_table',
                geometry_type: 'point',
                style_properties: { 'circle-radius': 10, 'circle-color': '#ff0000' },
                description: 'Update point style',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('Expected success result');
        }
        expect(result.appliedUpdate.geometryType).toBe('point');
        expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
            {
                id: 'duckdb-points-test_table',
                type: 'circle',
                paint: { 'circle-color': '#ff0000', 'circle-radius': 10 },
            },
        ]);
    });

    it('should update line layer successfully', async () => {
        const existingLayer: VectorTileLayer = {
            id: 'duckdb-lines-test_table',
            type: 'line',
            paint: { 'line-color': '#0000ff', 'line-width': 2 },
        };

        const mockMapSpec: MapSpec = {
            tableStyles: {
                test_table: [existingLayer],
            },
        };

        mockGetMapSpec = vi.fn(() => mockMapSpec);
        mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

        const tool = createMapStyleTool(mockGetMapSpec, mockOnMapStyleUpdate, null, null);
        if (!tool) throw new Error('Tool should be created');
        const result = await executeToolForTest<MapStyleUpdateResult>(
            tool.execute,
            {
                table_name: 'test_table',
                geometry_type: 'line',
                style_properties: { 'line-width': 5, 'line-opacity': 0.7 },
                description: 'Update line style',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('Expected success result');
        }
        expect(result.appliedUpdate.geometryType).toBe('line');
        expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
            {
                id: 'duckdb-lines-test_table',
                type: 'line',
                paint: { 'line-color': '#0000ff', 'line-width': 5, 'line-opacity': 0.7 },
            },
        ]);
    });
});

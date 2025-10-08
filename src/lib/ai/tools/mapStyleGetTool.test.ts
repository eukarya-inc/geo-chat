import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMapStyleGetTool } from './mapStyleGetTool';
import type { MapSpec } from '../../../store/remoteAtoms';
import type { VectorTileLayer } from '../../../components/map';

describe('createMapStyleGetTool', () => {
    let mockGetMapSpec: (tableName: string) => MapSpec | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetMapSpec = vi.fn();
    });

    it('should create a tool with correct metadata', () => {
        const tool = createMapStyleGetTool(mockGetMapSpec);

        expect(tool).toBeDefined();
        expect(tool.description).toContain('Get the current map style configuration');
        expect(tool.parameters).toBeDefined();
    });

    it('should handle map spec not available error', async () => {
        mockGetMapSpec = vi.fn(() => undefined);

        const tool = createMapStyleGetTool(mockGetMapSpec);
        const result = await tool.execute(
            {
                table_name: 'test_table',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('No map specification found');
        expect(result.tableStyles).toBeNull();
        expect(result.extraStyle).toBeNull();
    });

    it('should return error when mapSpec does not exist for table', async () => {
        mockGetMapSpec = vi.fn(() => undefined);

        const tool = createMapStyleGetTool(mockGetMapSpec);
        const result = await tool.execute(
            {
                table_name: 'test_table',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('No map specification found for table "test_table"');
        expect(result.tableStyles).toBeNull();
        expect(result.extraStyle).toBeNull();
    });

    it('should return empty styles when no custom styles are configured', async () => {
        const mockMapSpec: MapSpec = {
            // mapSpec exists but no styles configured
        };

        mockGetMapSpec = vi.fn(() => mockMapSpec);

        const tool = createMapStyleGetTool(mockGetMapSpec);
        const result = await tool.execute(
            {
                table_name: 'test_table',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        expect(result.tableStyles).toEqual([]);
        expect(result.extraStyle).toBeNull();
        expect(result.metadata?.note).toContain('No custom styles configured. Default styles will be used');
    });

    it('should return table styles and extra style when configured', async () => {
        const mockLayer: VectorTileLayer = {
            id: 'test-fill-layer',
            type: 'fill',
            paint: { 'fill-color': '#ff0000' },
        };

        const mockExtraStyle = {
            version: 8 as const,
            sources: {},
            layers: [],
        };

        const mockMapSpec: MapSpec = {
            tableStyles: {
                test_table: [mockLayer],
            },
            style: mockExtraStyle,
        };

        mockGetMapSpec = vi.fn(() => mockMapSpec);

        const tool = createMapStyleGetTool(mockGetMapSpec);
        const result = await tool.execute(
            {
                table_name: 'test_table',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Retrieved map styles for table "test_table"');
        expect(result.tableStyles).toEqual([mockLayer]);
        expect(result.extraStyle).toEqual(mockExtraStyle);
        expect(result.metadata?.hasTableStyles).toBe(true);
        expect(result.metadata?.hasExtraStyle).toBe(true);
        expect(result.metadata?.layerCount).toBe(1);
        expect(result.metadata?.note).toBeNull();
    });

    it('should handle only table styles without extra style', async () => {
        const mockLayers: VectorTileLayer[] = [
            {
                id: 'test-fill-layer',
                type: 'fill',
                paint: { 'fill-color': '#ff0000' },
            },
            {
                id: 'test-line-layer',
                type: 'line',
                paint: { 'line-color': '#0000ff' },
            },
        ];

        const mockMapSpec: MapSpec = {
            tableStyles: {
                test_table: mockLayers,
            },
            // No extra style
        };

        mockGetMapSpec = vi.fn(() => mockMapSpec);

        const tool = createMapStyleGetTool(mockGetMapSpec);
        const result = await tool.execute(
            {
                table_name: 'test_table',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        expect(result.tableStyles).toEqual(mockLayers);
        expect(result.extraStyle).toBeNull();
        expect(result.metadata?.hasTableStyles).toBe(true);
        expect(result.metadata?.hasExtraStyle).toBe(false);
        expect(result.metadata?.layerCount).toBe(2);
    });
});

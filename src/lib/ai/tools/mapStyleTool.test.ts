import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMapStyleTool } from './mapStyleTool';
import type { ChatState } from '../../../store/modelingRemoteAtoms';
import type { TableStyle, VectorTileLayer } from '../../../components/map';

describe('createMapStyleTool', () => {
  let mockGetCurrentChatState: () => ChatState | null;
  let mockOnMapStyleUpdate: (tableName: string, style: TableStyle) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChatState = vi.fn();
    mockOnMapStyleUpdate = vi.fn();
  });

  it('should return null if onMapStyleUpdate is not provided', () => {
    const tool = createMapStyleTool(mockGetCurrentChatState, undefined, null, null);
    expect(tool).toBeNull();
  });

  it('should create a tool with correct metadata', () => {
    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate, null, null);

    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Update map styles');
    expect(tool?.parameters).toBeDefined();
  });

  it('should handle chat state not available error', async () => {
    mockGetCurrentChatState = vi.fn(() => null);
    mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate, null, null);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      geometry_type: 'polygon',
      style_properties: { 'fill-color': '#ff0000' },
      description: 'Test update'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Chat state is not available');
  });

  it('should update polygon layers successfully', async () => {
    const existingFillLayer: VectorTileLayer = {
      id: 'duckdb-polygons-test_table',
      type: 'fill',
      paint: { 'fill-color': '#0000ff', 'fill-opacity': 0.3 }
    };

    const existingOutlineLayer: VectorTileLayer = {
      id: 'duckdb-polygon-outlines-test_table',
      type: 'line',
      paint: { 'line-color': '#0000ff', 'line-width': 1 }
    };

    const mockChatState: ChatState = {
      messages: [],
      tables: {},
      mapSpecs: {
        'test_table': {
          tableStyles: {
            'test_table': [existingFillLayer, existingOutlineLayer]
          }
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);
    mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate, null, null);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      geometry_type: 'polygon',
      style_properties: { 'fill-color': '#ff0000', 'fill-opacity': 0.5 },
      description: 'Update polygon style'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Update polygon style');
    expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
      {
        id: 'duckdb-polygons-test_table',
        type: 'fill',
        paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.5 }
      },
      {
        id: 'duckdb-polygon-outlines-test_table',
        type: 'line',
        paint: { 'line-color': '#ff0000', 'line-width': 1, 'line-opacity': 0.8 }
      }
    ]);
  });

  it('should update point layer successfully', async () => {
    const existingLayer: VectorTileLayer = {
      id: 'duckdb-points-test_table',
      type: 'circle',
      paint: { 'circle-color': '#0000ff' }
    };

    const mockChatState: ChatState = {
      messages: [],
      tables: {},
      mapSpecs: {
        'test_table': {
          tableStyles: {
            'test_table': [existingLayer]
          }
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);
    mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate, null, null);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      geometry_type: 'point',
      style_properties: { 'circle-radius': 10, 'circle-color': '#ff0000' },
      description: 'Update point style'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.appliedUpdate?.geometryType).toBe('point');
    expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
      {
        id: 'duckdb-points-test_table',
        type: 'circle',
        paint: { 'circle-color': '#ff0000', 'circle-radius': 10 }
      }
    ]);
  });

  it('should update line layer successfully', async () => {
    const existingLayer: VectorTileLayer = {
      id: 'duckdb-lines-test_table',
      type: 'line',
      paint: { 'line-color': '#0000ff', 'line-width': 2 }
    };

    const mockChatState: ChatState = {
      messages: [],
      tables: {},
      mapSpecs: {
        'test_table': {
          tableStyles: {
            'test_table': [existingLayer]
          }
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);
    mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate, null, null);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      geometry_type: 'line',
      style_properties: { 'line-width': 5, 'line-opacity': 0.7 },
      description: 'Update line style'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.appliedUpdate?.geometryType).toBe('line');
    expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
      {
        id: 'duckdb-lines-test_table',
        type: 'line',
        paint: { 'line-color': '#0000ff', 'line-width': 5, 'line-opacity': 0.7 }
      }
    ]);
  });
});
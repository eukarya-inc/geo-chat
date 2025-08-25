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
    const tool = createMapStyleTool(mockGetCurrentChatState, undefined);
    expect(tool).toBeNull();
  });

  it('should create a tool with correct metadata', () => {
    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate);

    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Update map layer styles');
    expect(tool?.parameters).toBeDefined();
  });

  it('should handle chat state not available error', async () => {
    mockGetCurrentChatState = vi.fn(() => null);
    mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      layer_type: 'fill',
      layer_id: 'test-fill-layer',
      paint_properties: { 'fill-color': '#ff0000' },
      description: 'Test update'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Chat state is not available');
  });

  it('should add new layer successfully', async () => {
    const mockChatState: ChatState = {
      messages: [],
      tables: {},
      mapSpecs: {
        'test_table': {
          tableStyles: {
            'test_table': []
          }
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);
    mockOnMapStyleUpdate = vi.fn().mockResolvedValue(undefined);

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      layer_type: 'fill',
      layer_id: 'test-fill-layer',
      paint_properties: { 'fill-color': '#ff0000', 'fill-opacity': 0.5 },
      description: 'Add fill layer'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Add fill layer');
    expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
      {
        id: 'test-fill-layer',
        type: 'fill',
        paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.5 }
      }
    ]);
  });

  it('should update existing layer', async () => {
    const existingLayer: VectorTileLayer = {
      id: 'test-circle-layer',
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

    const tool = createMapStyleTool(mockGetCurrentChatState, mockOnMapStyleUpdate);
    if (!tool) throw new Error('Tool should be created');
    const result = await tool.execute({
      table_name: 'test_table',
      layer_type: 'circle',
      layer_id: 'test-circle-layer',
      paint_properties: { 'circle-radius': 10 },
      description: 'Update circle radius'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.appliedUpdate?.layerId).toBe('test-circle-layer');
    expect(mockOnMapStyleUpdate).toHaveBeenCalledWith('test_table', [
      {
        id: 'test-circle-layer',
        type: 'circle',
        paint: { 'circle-color': '#0000ff', 'circle-radius': 10 },
        layout: {}
      }
    ]);
  });
});

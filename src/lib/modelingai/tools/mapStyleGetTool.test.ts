import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMapStyleGetTool } from './mapStyleGetTool';
import type { ChatState } from '../../../store/modelingRemoteAtoms';
import type { VectorTileLayer } from '../../../components/map';

describe('createMapStyleGetTool', () => {
  let mockGetCurrentChatState: () => ChatState | null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChatState = vi.fn();
  });

  it('should create a tool with correct metadata', () => {
    const tool = createMapStyleGetTool(mockGetCurrentChatState);
    
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Get the current map style configuration');
    expect(tool.parameters).toBeDefined();
  });

  it('should handle chat state not available error', async () => {
    mockGetCurrentChatState = vi.fn(() => null);
    
    const tool = createMapStyleGetTool(mockGetCurrentChatState);
    const result = await tool.execute({
      table_name: 'test_table'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Chat state is not available');
    expect(result.tableStyles).toBeNull();
    expect(result.extraStyle).toBeNull();
  });

  it('should return error when mapSpec does not exist for table', async () => {
    const mockChatState: ChatState = {
      messages: [],
      tableHistory: [],
      mapSpecs: {
        'other_table': {
          tableStyles: {}
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);

    const tool = createMapStyleGetTool(mockGetCurrentChatState);
    const result = await tool.execute({
      table_name: 'test_table'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No map specification found for table "test_table"');
    expect(result.tableStyles).toBeNull();
    expect(result.extraStyle).toBeNull();
  });

  it('should return empty styles when no custom styles are configured', async () => {
    const mockChatState: ChatState = {
      messages: [],
      tableHistory: [],
      mapSpecs: {
        'test_table': {
          // mapSpec exists but no styles configured
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);

    const tool = createMapStyleGetTool(mockGetCurrentChatState);
    const result = await tool.execute({
      table_name: 'test_table'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.tableStyles).toEqual([]);
    expect(result.extraStyle).toBeNull();
    expect(result.metadata?.note).toContain('No custom styles configured. Default styles will be used');
  });

  it('should return table styles and extra style when configured', async () => {
    const mockLayer: VectorTileLayer = {
      id: 'test-fill-layer',
      type: 'fill',
      paint: { 'fill-color': '#ff0000' }
    };

    const mockExtraStyle = {
      version: 8 as const,
      sources: {},
      layers: []
    };

    const mockChatState: ChatState = {
      messages: [],
      tableHistory: [],
      mapSpecs: {
        'test_table': {
          tableStyles: {
            'test_table': [mockLayer]
          },
          style: mockExtraStyle
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);

    const tool = createMapStyleGetTool(mockGetCurrentChatState);
    const result = await tool.execute({
      table_name: 'test_table'
    }, {
      messages: [],
      toolCallId: ""
    });

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
        paint: { 'fill-color': '#ff0000' }
      },
      {
        id: 'test-line-layer',
        type: 'line',
        paint: { 'line-color': '#0000ff' }
      }
    ];

    const mockChatState: ChatState = {
      messages: [],
      tableHistory: [],
      mapSpecs: {
        'test_table': {
          tableStyles: {
            'test_table': mockLayers
          }
          // No extra style
        }
      }
    };

    mockGetCurrentChatState = vi.fn(() => mockChatState);

    const tool = createMapStyleGetTool(mockGetCurrentChatState);
    const result = await tool.execute({
      table_name: 'test_table'
    }, {
      messages: [],
      toolCallId: ""
    });

    expect(result.success).toBe(true);
    expect(result.tableStyles).toEqual(mockLayers);
    expect(result.extraStyle).toBeNull();
    expect(result.metadata?.hasTableStyles).toBe(true);
    expect(result.metadata?.hasExtraStyle).toBe(false);
    expect(result.metadata?.layerCount).toBe(2);
  });
});
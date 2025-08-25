import { tool } from 'ai';
import { z } from 'zod';
import type { TableStyle, VectorTileLayer } from '../../../components/map';
import type { ChatState } from '../../../store/modelingRemoteAtoms';

export function createMapStyleTool(
  getCurrentChatState: () => ChatState | null,
  onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>
) {
  if (!onMapStyleUpdate) return null;
  return tool({
    description: `Update map layer styles for a specific table. Each table can have multiple layers (fill, line, circle, etc.) with different styling properties.

IMPORTANT: This tool creates or updates MapLibre GL layer specifications for tables displayed on the map.

LAYER TYPES:
- fill: For polygon features (fill-color, fill-opacity, fill-outline-color)
- line: For line features (line-color, line-width, line-opacity)
- circle: For point features (circle-color, circle-radius, circle-stroke-width)
- heatmap: For heat map visualization
- symbol: For text and icon labels

CONDITIONAL STYLING WITH MAPLIBRE GL EXPRESSIONS:
You can create conditional styles using MapLibre GL expression syntax:
- Basic conditional: ["case", ["<", ["get", "property"], 100], "red", "blue"]
- Multi-condition: ["case", ["<", ["get", "pop"], 1000], "#fee", ["<", ["get", "pop"], 10000], "#fcc", "#f00"]
- Categorical: ["case", ["==", ["get", "type"], "urban"], "red", ["==", ["get", "type"], "rural"], "green", "gray"]
- Interpolated: ["interpolate", ["linear"], ["get", "value"], 0, "blue", 100, "red"]

For choropleth maps, use expressions like:
["interpolate", ["linear"], ["get", "property_name"], min_value, "light_color", max_value, "dark_color"]

For categorical styling:
["case", ["==", ["get", "category"], "A"], "red", ["==", ["get", "category"], "B"], "blue", "gray"]

Common style properties by layer type:
- polygon: fill-color, fill-opacity, fill-outline-color
- line: line-color, line-width, line-opacity
- point: circle-color, circle-radius, circle-stroke-width, circle-stroke-color
- heatmap: heatmap-radius, heatmap-weight, heatmap-intensity, heatmap-color
- grid: (custom grid properties)

To show/hide layers, include a visibility property in the style.`,

    parameters: z.object({
      table_name: z.string()
        .describe('Name of the table to update styles for'),
      layer_type: z.enum(['fill', 'line', 'circle', 'heatmap', 'symbol'])
        .describe('Type of layer to create or update'),
      layer_id: z.string()
        .describe('Unique identifier for the layer'),
      paint_properties: z.record(z.any()).optional()
        .describe('Paint properties for the layer (colors, widths, etc.)'),
      layout_properties: z.record(z.any()).optional()
        .describe('Layout properties for the layer (visibility, text placement, etc.)'),
      filter: z.any().optional()
        .describe('Optional filter expression to limit which features are displayed'),
      description: z.string()
        .describe('Human-readable description of what this style change does')
    }),

    execute: async ({ table_name, layer_type, layer_id, paint_properties, layout_properties, filter, description }) => {
      try {
        // Get current state to check existing styles
        const chatState = getCurrentChatState();
        if (!chatState) {
          return {
            success: false,
            error: 'Chat state is not available'
          };
        }

        // Get current table styles (array of layers)
        const currentMapSpec = chatState.mapSpecs?.[table_name];
        const currentTableStyles = currentMapSpec?.tableStyles || {};
        const currentLayers = currentTableStyles[table_name] || [];

        // Find existing layer or create new one
        const existingLayerIndex = currentLayers.findIndex((l: VectorTileLayer) => l.id === layer_id);
        
        // Create the layer specification
        const newLayer: Partial<VectorTileLayer> = {
          id: layer_id,
          type: layer_type as VectorTileLayer['type'],
        };
        
        if (paint_properties) {
          newLayer.paint = paint_properties;
        }
        
        if (layout_properties) {
          newLayer.layout = layout_properties;
        }
        
        if (filter) {
          newLayer.filter = filter;
        }

        // Update or add the layer
        let updatedLayers: TableStyle;
        if (existingLayerIndex >= 0) {
          // Update existing layer
          updatedLayers = [...currentLayers];
          updatedLayers[existingLayerIndex] = {
            ...currentLayers[existingLayerIndex],
            ...newLayer,
            paint: { ...currentLayers[existingLayerIndex].paint, ...newLayer.paint },
            layout: { ...currentLayers[existingLayerIndex].layout, ...newLayer.layout }
          } as VectorTileLayer;
        } else {
          // Add new layer
          updatedLayers = [...currentLayers, newLayer as VectorTileLayer];
        }

        // Apply the update through callback
        await onMapStyleUpdate(table_name, updatedLayers);

        return {
          success: true,
          message: `${description} (Applied to table: ${table_name}, layer: ${layer_id})`,
          appliedUpdate: {
            tableName: table_name,
            layerId: layer_id,
            layerType: layer_type,
            layers: updatedLayers
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Error applying style update: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}
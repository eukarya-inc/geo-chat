import { tool } from 'ai';
import { z } from 'zod';
import { store } from '../../../store';
import { 
  addLayer, 
  removeLayer, 
  updateLayerVisibility,
  updateLayerConfig,
  updateLayerVisConfig,
  updateLayerVisualChannel,
  showAllLayers,
  hideAllLayers
} from '../../../store/slices/layerSlice';
import { LayerType, VisualChannel } from '../../../types/layer.types';
import { COLOR_RANGES, getAllColorRanges } from '../../../utils/colorScales';

export const layerTool = tool({
  description: 'Manage map layers - create, update, remove layers and configure their visual properties',
  parameters: z.object({
    action: z.enum(['add', 'remove', 'update', 'list', 'show_all', 'hide_all', 'set_visual_channel']).describe('The action to perform on layers'),
    layerId: z.string().optional().describe('The ID of the layer to operate on (for update/remove actions)'),
    layerType: z.enum(['point', 'polygon', 'line', 'heatmap', 'hexagon', 'grid', 'arc', 'geojson']).optional().describe('Type of layer to create (for add action)'),
    dataId: z.string().optional().describe('The dataset/table ID to use for the layer (for add action)'),
    config: z.object({
      label: z.string().optional().describe('Display name for the layer'),
      isVisible: z.boolean().optional().describe('Whether the layer is visible'),
      color: z.tuple([z.number(), z.number(), z.number()]).optional().describe('RGB color array [r, g, b] where each value is 0-255'),
      opacity: z.number().min(0).max(1).optional().describe('Layer opacity (0-1)'),
      radius: z.number().optional().describe('Point radius in pixels'),
      thickness: z.number().optional().describe('Line thickness in pixels'),
      filled: z.boolean().optional().describe('Whether to fill polygons/points'),
      outline: z.boolean().optional().describe('Whether to show outline'),
      strokeColor: z.tuple([z.number(), z.number(), z.number()]).optional().describe('RGB stroke color [r, g, b]')
    }).optional(),
    visualChannel: z.object({
      channel: z.enum(['color', 'size', 'radius', 'height', 'strokeColor']).describe('The visual channel to configure'),
      field: z.string().describe('The data field to map to this visual channel'),
      scale: z.enum(['linear', 'quantile', 'ordinal', 'sqrt', 'log']).optional().describe('Scale type for the mapping'),
      colorRange: z.string().optional().describe('Name of color range (e.g., "YlOrRd", "RdBu", "Set2")'),
      sizeRange: z.tuple([z.number(), z.number()]).optional().describe('Size range [min, max] for size/radius channels')
    }).optional()
  }),
  execute: async ({ action, layerId, layerType, dataId, config, visualChannel }) => {
    const state = store.getState();
    const { layers, datasets } = state.layers;
    
    switch (action) {
      case 'add': {
        if (!layerType || !dataId) {
          return { error: 'layerType and dataId are required for adding a layer' };
        }
        
        const dataset = datasets.find(d => d.id === dataId);
        if (!dataset) {
          return { error: `Dataset "${dataId}" not found. Available datasets: ${datasets.map(d => d.id).join(', ')}` };
        }
        
        store.dispatch(addLayer({
          type: layerType as LayerType,
          dataId: dataId,
          config: config
        }));
        
        const newState = store.getState().layers;
        const newLayer = newState.layers[newState.layers.length - 1];
        
        return {
          success: true,
          message: `Added ${layerType} layer for dataset "${dataset.label}"`,
          layerId: newLayer.id,
          layer: newLayer
        };
      }
      
      case 'remove': {
        if (!layerId) {
          return { error: 'layerId is required for removing a layer' };
        }
        
        const layer = layers.find(l => l.id === layerId);
        if (!layer) {
          return { error: `Layer "${layerId}" not found` };
        }
        
        store.dispatch(removeLayer(layerId));
        
        return {
          success: true,
          message: `Removed layer "${layer.config.label}"`
        };
      }
      
      case 'update': {
        if (!layerId) {
          return { error: 'layerId is required for updating a layer' };
        }
        
        const layer = layers.find(l => l.id === layerId);
        if (!layer) {
          return { error: `Layer "${layerId}" not found` };
        }
        
        if (config) {
          // Handle visibility separately
          if ('isVisible' in config && config.isVisible !== undefined) {
            store.dispatch(updateLayerVisibility({
              layerId: layerId,
              isVisible: config.isVisible
            }));
          }
          
          // Handle vis config properties
          const visConfigProps = ['opacity', 'radius', 'thickness', 'filled', 'outline', 'strokeColor'];
          const visConfig: any = {};
          const layerConfig: any = {};
          
          Object.entries(config).forEach(([key, value]) => {
            if (visConfigProps.includes(key)) {
              visConfig[key] = value;
            } else if (key !== 'isVisible') {
              layerConfig[key] = value;
            }
          });
          
          if (Object.keys(visConfig).length > 0) {
            store.dispatch(updateLayerVisConfig({
              layerId: layerId,
              visConfig
            }));
          }
          
          if (Object.keys(layerConfig).length > 0) {
            store.dispatch(updateLayerConfig({
              layerId: layerId,
              config: layerConfig
            }));
          }
        }
        
        return {
          success: true,
          message: `Updated layer "${layer.config.label}"`,
          layer: store.getState().layers.layers.find(l => l.id === layerId)
        };
      }
      
      case 'set_visual_channel': {
        if (!layerId || !visualChannel) {
          return { error: 'layerId and visualChannel are required for setting visual channels' };
        }
        
        const layer = layers.find(l => l.id === layerId);
        if (!layer) {
          return { error: `Layer "${layerId}" not found` };
        }
        
        const { channel, field, scale = 'linear', colorRange, sizeRange } = visualChannel;
        
        if (!channel || !field) {
          return { error: 'channel and field are required in visualChannel' };
        }
        
        const dataset = datasets.find(d => d.id === layer.config.dataId);
        if (!dataset) {
          return { error: `Dataset for layer not found` };
        }
        
        const fieldObj = dataset.fields.find(f => f.name === field);
        if (!fieldObj) {
          return { error: `Field "${field}" not found in dataset. Available fields: ${dataset.fields.map(f => f.name).join(', ')}` };
        }
        
        // Calculate domain based on field type
        let domain: any;
        const values = dataset.allData.map(d => d[field]).filter(v => v != null);
        
        if (fieldObj.type === 'string') {
          domain = Array.from(new Set(values));
        } else {
          domain = [Math.min(...values), Math.max(...values)];
        }
        
        // Determine range based on channel type
        let range: any;
        if (channel === 'color' || channel === 'strokeColor') {
          if (colorRange) {
            // Find color range by name
            const foundRange = getAllColorRanges().find(r => r.name.toLowerCase() === colorRange.toLowerCase());
            range = foundRange || COLOR_RANGES.ColorBrewer.YlOrRd;
          } else {
            // Default color range based on field type
            range = fieldObj.type === 'string' 
              ? COLOR_RANGES.ColorBrewer.Set2
              : COLOR_RANGES.ColorBrewer.YlOrRd;
          }
        } else if (channel === 'size' || channel === 'radius' || channel === 'height') {
          range = { min: sizeRange?.[0] || 1, max: sizeRange?.[1] || 50 };
        }
        
        const visualChannelObj: VisualChannel = {
          property: field,
          field: fieldObj,
          scale: scale as any,
          domain,
          range,
          channelScaleType: channel === 'color' ? 'color' : 'size'
        };
        
        store.dispatch(updateLayerVisualChannel({
          layerId: layerId,
          channel: channel as any,
          channelConfig: visualChannelObj
        }));
        
        return {
          success: true,
          message: `Set ${channel} visual channel for layer "${layer.config.label}" using field "${field}"`,
          visualChannel: visualChannelObj,
          layer: store.getState().layers.layers.find(l => l.id === layerId)
        };
      }
      
      case 'list': {
        const layerInfo = layers.map(layer => {
          const dataset = datasets.find(d => d.id === layer.config.dataId);
          return {
            id: layer.id,
            type: layer.type,
            label: layer.config.label,
            datasetId: layer.config.dataId,
            datasetLabel: dataset?.label || 'Unknown',
            isVisible: layer.config.isVisible,
            color: layer.config.color,
            visualChannels: Object.keys(layer.visualChannels)
          };
        });
        
        return {
          layers: layerInfo,
          count: layers.length,
          datasets: datasets.map(d => ({
            id: d.id,
            label: d.label,
            fields: d.fields.map(f => ({ name: f.name, type: f.type }))
          }))
        };
      }
      
      case 'show_all': {
        store.dispatch(showAllLayers());
        return {
          success: true,
          message: 'All layers are now visible'
        };
      }
      
      case 'hide_all': {
        store.dispatch(hideAllLayers());
        return {
          success: true,
          message: 'All layers are now hidden'
        };
      }
      
      default:
        return { error: `Unknown action: ${action}` };
    }
  }
});
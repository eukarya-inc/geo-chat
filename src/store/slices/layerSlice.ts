import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Layer, LayerType, Dataset, Field, VisualChannel } from '../../types/layer.types';

interface LayerState {
  layers: Layer[];
  layerOrder: string[];
  datasets: Dataset[];
  layerClasses: Record<LayerType, any>; // Layer class constructors
  layerBlending: 'normal' | 'additive' | 'subtractive';
  hoverInfo: {
    layer?: string;
    object?: any;
    picked?: boolean;
    x?: number;
    y?: number;
  } | null;
  clicked: {
    layer?: string;
    object?: any;
  } | null;
  splitMaps: Array<{
    layers: Record<string, boolean>;
  }>;
  animationConfig: {
    domain: [number, number] | null;
    currentTime: number;
    speed: number;
    isAnimating: boolean;
  };
}

const initialState: LayerState = {
  layers: [],
  layerOrder: [],
  datasets: [],
  layerClasses: {} as Record<LayerType, any>,
  layerBlending: 'normal',
  hoverInfo: null,
  clicked: null,
  splitMaps: [],
  animationConfig: {
    domain: null,
    currentTime: 0,
    speed: 1,
    isAnimating: false,
  },
};

// Generate unique layer ID
const generateLayerId = (layers: Layer[]): string => {
  const existingIds = new Set(layers.map(l => l.id));
  let id = 1;
  while (existingIds.has(`layer_${id}`)) {
    id++;
  }
  return `layer_${id}`;
};

// Default layer configs by type (following Kepler.gl)
const getDefaultLayerConfig = (type: LayerType, dataId: string): Partial<Layer> => {
  const baseConfig = {
    config: {
      dataId,
      label: `New ${type} layer`,
      color: [255, 153, 31] as [number, number, number],
      columns: {},
      isVisible: true,
      isConfigActive: true,
      hidden: false,
      visConfig: {
        opacity: 0.8,
        thickness: 2,
        strokeColor: [255, 255, 255] as [number, number, number],
      },
    },
    visualChannels: {},
  };

  // Type-specific defaults
  switch (type) {
    case 'point':
      return {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          visConfig: {
            ...baseConfig.config.visConfig,
            radius: 10,
            fixedRadius: false,
            filled: true,
            outline: false,
          },
        },
      };
    case 'arc':
      return {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          visConfig: {
            ...baseConfig.config.visConfig,
            opacity: 0.8,
            thickness: 2,
            targetColor: [255, 0, 0] as [number, number, number],
          },
        },
      };
    case 'polygon':
      return {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          visConfig: {
            ...baseConfig.config.visConfig,
            opacity: 0.8,
            wireframe: false,
            filled: true,
            outline: true,
          },
        },
      };
    case 'hexagon':
    case 'grid':
      return {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          visConfig: {
            ...baseConfig.config.visConfig,
            worldUnitSize: 1,
            coverage: 1,
            percentile: [0, 100] as [number, number],
            elevationScale: 5,
            enable3d: false,
          },
        },
      };
    case 'heatmap':
      return {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          visConfig: {
            ...baseConfig.config.visConfig,
            weight: 1,
            intensity: 1,
          },
        },
      };
    default:
      return baseConfig;
  }
};

export const layerSlice = createSlice({
  name: 'layers',
  initialState,
  reducers: {
    // Dataset management
    addDataset: (state, action: PayloadAction<Dataset>) => {
      const existing = state.datasets.findIndex(d => d.id === action.payload.id);
      if (existing >= 0) {
        state.datasets[existing] = action.payload;
      } else {
        state.datasets.push(action.payload);
      }
    },
    
    removeDataset: (state, action: PayloadAction<string>) => {
      state.datasets = state.datasets.filter(d => d.id !== action.payload);
      // Remove layers using this dataset
      state.layers = state.layers.filter(l => l.config.dataId !== action.payload);
      state.layerOrder = state.layerOrder.filter(id => 
        state.layers.some(l => l.id === id)
      );
    },

    // Layer management
    addLayer: (state, action: PayloadAction<{
      type: LayerType;
      dataId: string;
      config?: Partial<Layer['config']>;
    }>) => {
      const { type, dataId, config } = action.payload;
      const id = generateLayerId(state.layers);
      const defaultConfig = getDefaultLayerConfig(type, dataId);
      
      const newLayer: Layer = {
        id,
        type,
        ...defaultConfig,
        config: {
          ...defaultConfig.config!,
          ...config,
        },
      } as Layer;
      
      state.layers.push(newLayer);
      state.layerOrder.unshift(id); // Add to top
    },
    
    removeLayer: (state, action: PayloadAction<string>) => {
      state.layers = state.layers.filter(l => l.id !== action.payload);
      state.layerOrder = state.layerOrder.filter(id => id !== action.payload);
    },
    
    duplicateLayer: (state, action: PayloadAction<string>) => {
      const layer = state.layers.find(l => l.id === action.payload);
      if (layer) {
        const newId = generateLayerId(state.layers);
        const newLayer: Layer = {
          ...JSON.parse(JSON.stringify(layer)), // Deep clone
          id: newId,
          config: {
            ...layer.config,
            label: `${layer.config.label} Copy`,
          },
        };
        state.layers.push(newLayer);
        state.layerOrder.unshift(newId);
      }
    },
    
    reorderLayer: (state, action: PayloadAction<{
      oldIndex: number;
      newIndex: number;
    }>) => {
      const { oldIndex, newIndex } = action.payload;
      const [removed] = state.layerOrder.splice(oldIndex, 1);
      state.layerOrder.splice(newIndex, 0, removed);
    },
    
    // Layer configuration
    updateLayerConfig: (state, action: PayloadAction<{
      layerId: string;
      config: Partial<Layer['config']>;
    }>) => {
      const layer = state.layers.find(l => l.id === action.payload.layerId);
      if (layer) {
        layer.config = { ...layer.config, ...action.payload.config };
      }
    },
    
    updateLayerVisConfig: (state, action: PayloadAction<{
      layerId: string;
      visConfig: Partial<Layer['config']['visConfig']>;
    }>) => {
      const layer = state.layers.find(l => l.id === action.payload.layerId);
      if (layer) {
        layer.config.visConfig = { 
          ...layer.config.visConfig, 
          ...action.payload.visConfig 
        };
      }
    },
    
    updateLayerVisibility: (state, action: PayloadAction<{
      layerId: string;
      isVisible: boolean;
    }>) => {
      const layer = state.layers.find(l => l.id === action.payload.layerId);
      if (layer) {
        layer.config.isVisible = action.payload.isVisible;
      }
    },
    
    // Visual channel configuration
    updateLayerVisualChannel: (state, action: PayloadAction<{
      layerId: string;
      channel: keyof Layer['visualChannels'];
      channelConfig: VisualChannel;
    }>) => {
      const layer = state.layers.find(l => l.id === action.payload.layerId);
      if (layer) {
        layer.visualChannels[action.payload.channel] = action.payload.channelConfig;
      }
    },
    
    removeLayerVisualChannel: (state, action: PayloadAction<{
      layerId: string;
      channel: keyof Layer['visualChannels'];
    }>) => {
      const layer = state.layers.find(l => l.id === action.payload.layerId);
      if (layer) {
        delete layer.visualChannels[action.payload.channel];
      }
    },
    
    // Layer blending
    setLayerBlending: (state, action: PayloadAction<LayerState['layerBlending']>) => {
      state.layerBlending = action.payload;
    },
    
    // Interaction
    setHoverInfo: (state, action: PayloadAction<LayerState['hoverInfo']>) => {
      state.hoverInfo = action.payload;
    },
    
    setClicked: (state, action: PayloadAction<LayerState['clicked']>) => {
      state.clicked = action.payload;
    },
    
    // Animation
    setAnimationConfig: (state, action: PayloadAction<Partial<LayerState['animationConfig']>>) => {
      state.animationConfig = { ...state.animationConfig, ...action.payload };
    },
    
    // Split maps
    addSplitMap: (state) => {
      state.splitMaps.push({ layers: {} });
    },
    
    removeSplitMap: (state, action: PayloadAction<number>) => {
      state.splitMaps.splice(action.payload, 1);
    },
    
    toggleLayerForSplitMap: (state, action: PayloadAction<{
      mapIndex: number;
      layerId: string;
    }>) => {
      const { mapIndex, layerId } = action.payload;
      if (state.splitMaps[mapIndex]) {
        const current = state.splitMaps[mapIndex].layers[layerId] || false;
        state.splitMaps[mapIndex].layers[layerId] = !current;
      }
    },
    
    // Bulk operations
    showAllLayers: (state) => {
      state.layers.forEach(layer => {
        layer.config.isVisible = true;
      });
    },
    
    hideAllLayers: (state) => {
      state.layers.forEach(layer => {
        layer.config.isVisible = false;
      });
    },
    
    reset: () => initialState,
  },
});

export const {
  addDataset,
  removeDataset,
  addLayer,
  removeLayer,
  duplicateLayer,
  reorderLayer,
  updateLayerConfig,
  updateLayerVisConfig,
  updateLayerVisibility,
  updateLayerVisualChannel,
  removeLayerVisualChannel,
  setLayerBlending,
  setHoverInfo,
  setClicked,
  setAnimationConfig,
  addSplitMap,
  removeSplitMap,
  toggleLayerForSplitMap,
  showAllLayers,
  hideAllLayers,
  reset,
} = layerSlice.actions;

export default layerSlice.reducer;
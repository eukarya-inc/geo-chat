import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MapStyleManager } from '../../utils/mapStyleManager';

interface MapLayer {
  id: string;
  type: 'point' | 'line' | 'polygon' | 'heatmap' | 'grid';
  sourceTable: string;
  visible: boolean;
  style: Record<string, unknown>;
}

interface MapState {
  styleManager: MapStyleManager | null;
  layers: MapLayer[];
  activeLayerId: string | null;
  mapReady: boolean;
  bounds: [number, number, number, number] | null;
}

const initialState: MapState = {
  styleManager: null,
  layers: [],
  activeLayerId: null,
  mapReady: false,
  bounds: null,
};

const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    setStyleManager: (state, action: PayloadAction<MapStyleManager>) => {
      state.styleManager = action.payload;
      state.mapReady = true;
    },
    addLayer: (state, action: PayloadAction<MapLayer>) => {
      state.layers.push(action.payload);
      state.activeLayerId = action.payload.id;
    },
    updateLayer: (state, action: PayloadAction<{ id: string; updates: Partial<MapLayer> }>) => {
      const layer = state.layers.find(l => l.id === action.payload.id);
      if (layer) {
        Object.assign(layer, action.payload.updates);
      }
    },
    removeLayer: (state, action: PayloadAction<string>) => {
      state.layers = state.layers.filter(l => l.id !== action.payload);
      if (state.activeLayerId === action.payload) {
        state.activeLayerId = state.layers.length > 0 ? state.layers[0].id : null;
      }
    },
    setActiveLayer: (state, action: PayloadAction<string | null>) => {
      state.activeLayerId = action.payload;
    },
    toggleLayerVisibility: (state, action: PayloadAction<string>) => {
      const layer = state.layers.find(l => l.id === action.payload);
      if (layer) {
        layer.visible = !layer.visible;
      }
    },
    setBounds: (state, action: PayloadAction<[number, number, number, number]>) => {
      state.bounds = action.payload;
    },
    reset: () => initialState,
  },
});

export const {
  setStyleManager,
  addLayer,
  updateLayer,
  removeLayer,
  setActiveLayer,
  toggleLayerVisibility,
  setBounds,
  reset,
} = mapSlice.actions;

export default mapSlice.reducer;
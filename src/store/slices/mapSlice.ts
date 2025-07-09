import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface MapLayer {
  id: string;
  type: 'point' | 'polygon' | 'line' | 'heatmap' | 'choropleth';
  sourceId: string;
  visible: boolean;
  style: Record<string, any>;
}

interface MapState {
  layers: MapLayer[];
  viewport: {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
  };
  selectedFeatureId: string | null;
  mapStyle: string;
  isMapLoaded: boolean;
}

const initialState: MapState = {
  layers: [],
  viewport: {
    longitude: 0,
    latitude: 0,
    zoom: 2,
    bearing: 0,
    pitch: 0,
  },
  selectedFeatureId: null,
  mapStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  isMapLoaded: false,
};

const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    addLayer: (state, action: PayloadAction<MapLayer>) => {
      state.layers.push(action.payload);
    },
    removeLayer: (state, action: PayloadAction<string>) => {
      state.layers = state.layers.filter(layer => layer.id !== action.payload);
    },
    updateLayer: (state, action: PayloadAction<{ id: string; updates: Partial<MapLayer> }>) => {
      const index = state.layers.findIndex(l => l.id === action.payload.id);
      if (index !== -1) {
        state.layers[index] = { ...state.layers[index], ...action.payload.updates };
      }
    },
    setViewport: (state, action: PayloadAction<Partial<MapState['viewport']>>) => {
      state.viewport = { ...state.viewport, ...action.payload };
    },
    updateViewport: (state, action: PayloadAction<Partial<MapState['viewport']>>) => {
      state.viewport = { ...state.viewport, ...action.payload };
    },
    setSelectedFeature: (state, action: PayloadAction<string | null>) => {
      state.selectedFeatureId = action.payload;
    },
    setMapStyle: (state, action: PayloadAction<string>) => {
      state.mapStyle = action.payload;
    },
    setMapLoaded: (state, action: PayloadAction<boolean>) => {
      state.isMapLoaded = action.payload;
    },
  },
});

export const { 
  addLayer, 
  removeLayer, 
  updateLayer, 
  setViewport, 
  updateViewport,
  setSelectedFeature,
  setMapStyle,
  setMapLoaded
} = mapSlice.actions;
export default mapSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Dataset {
  id: string;
  name: string;
  type: 'geojson' | 'parquet' | 'csv' | 'json' | 'unknown';
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
    isGeometry?: boolean;
  }>;
  source?: 'file' | 'url';
  bounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

interface DataState {
  datasets: Dataset[];
  activeDatasetId: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: DataState = {
  datasets: [],
  activeDatasetId: null,
  isLoading: false,
  error: null,
};

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    addDataset: (state, action: PayloadAction<Dataset>) => {
      state.datasets.push(action.payload);
      // Auto-select if it's the first dataset
      if (state.datasets.length === 1) {
        state.activeDatasetId = action.payload.id;
      }
    },
    removeDataset: (state, action: PayloadAction<string>) => {
      state.datasets = state.datasets.filter(d => d.id !== action.payload);
      if (state.activeDatasetId === action.payload) {
        state.activeDatasetId = state.datasets.length > 0 ? state.datasets[0].id : null;
      }
    },
    setActiveDataset: (state, action: PayloadAction<string | null>) => {
      state.activeDatasetId = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { addDataset, removeDataset, setActiveDataset, setLoading, setError } = dataSlice.actions;
export default dataSlice.reducer;

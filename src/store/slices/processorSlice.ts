import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ProcessorResult } from '../../processors/base/DataProcessor';

interface ProcessingJob {
  id: string;
  fileName: string;
  processor: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: ProcessorResult;
  error?: string;
  startTime: number;
  endTime?: number;
}

interface ProcessorState {
  jobs: Record<string, ProcessingJob>;
  activeJobId: string | null;
  supportedFormats: string[];
}

const initialState: ProcessorState = {
  jobs: {},
  activeJobId: null,
  supportedFormats: []
};

const processorSlice = createSlice({
  name: 'processor',
  initialState,
  reducers: {
    setSupportedFormats: (state, action: PayloadAction<string[]>) => {
      state.supportedFormats = action.payload;
    },
    
    startProcessing: (state, action: PayloadAction<{
      id: string;
      fileName: string;
      processor: string;
    }>) => {
      const { id, fileName, processor } = action.payload;
      state.jobs[id] = {
        id,
        fileName,
        processor,
        status: 'processing',
        progress: 0,
        startTime: Date.now()
      };
      state.activeJobId = id;
    },
    
    updateProgress: (state, action: PayloadAction<{ id: string; progress: number }>) => {
      const job = state.jobs[action.payload.id];
      if (job) {
        job.progress = action.payload.progress;
      }
    },
    
    completeProcessing: (state, action: PayloadAction<{
      id: string;
      result: ProcessorResult;
    }>) => {
      const job = state.jobs[action.payload.id];
      if (job) {
        job.status = 'completed';
        job.progress = 100;
        job.result = action.payload.result;
        job.endTime = Date.now();
      }
      
      if (state.activeJobId === action.payload.id) {
        state.activeJobId = null;
      }
    },
    
    failProcessing: (state, action: PayloadAction<{
      id: string;
      error: string;
    }>) => {
      const job = state.jobs[action.payload.id];
      if (job) {
        job.status = 'failed';
        job.error = action.payload.error;
        job.endTime = Date.now();
      }
      
      if (state.activeJobId === action.payload.id) {
        state.activeJobId = null;
      }
    },
    
    removeJob: (state, action: PayloadAction<string>) => {
      delete state.jobs[action.payload];
      
      if (state.activeJobId === action.payload) {
        state.activeJobId = null;
      }
    },
    
    clearJobs: (state) => {
      state.jobs = {};
      state.activeJobId = null;
    }
  }
});

export const {
  setSupportedFormats,
  startProcessing,
  updateProgress,
  completeProcessing,
  failProcessing,
  removeJob,
  clearJobs
} = processorSlice.actions;

export default processorSlice.reducer;
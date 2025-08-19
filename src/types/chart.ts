import type { VegaLiteSpec } from './vega';

export interface ChartSpec {
  id: string;
  spec: VegaLiteSpec;
  timestamp: Date;
  title?: string;
}
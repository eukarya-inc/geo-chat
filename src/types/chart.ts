import type { TopLevelSpec } from 'vega-lite';

export interface ChartSpec {
  id: string;
  spec: VegaChartSpec;
  timestamp: Date;
  title?: string;
}

export type VegaChartSpec = TopLevelSpec & {
  data?: TopLevelSpec["data"] & {
    sql?: string;
  };
};

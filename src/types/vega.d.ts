export interface VegaLiteSpec {
  $schema?: string;
  data?: {
    sql?: string;
    values?: Record<string, unknown>[];
  };
  mark?: string | {
    type?: string;
    size?: number;
    opacity?: number;
    point?: boolean;
    strokeWidth?: number;
    innerRadius?: number;
    extent?: string;
    [key: string]: unknown;
  };
  encoding?: {
    [key: string]: {
      field?: string;
      type?: string;
      aggregate?: string;
      bin?: boolean;
      [key: string]: unknown;
    };
  };
  title?: string | {
    text?: string;
    [key: string]: unknown;
  };
  width?: number;
  height?: number;
  config?: {
    view?: { stroke?: null };
    axis?: { grid?: boolean };
    legend?: { orient?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
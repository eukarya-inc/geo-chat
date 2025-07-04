// Color scales and palettes following Kepler.gl patterns

export const SCALE_TYPES = {
  linear: 'linear',
  quantile: 'quantile',
  quantize: 'quantize',
  ordinal: 'ordinal',
  sqrt: 'sqrt',
  log: 'log',
} as const;

export const CHANNEL_SCALE_TYPES = {
  radius: 'radius',
  color: 'color',
  size: 'size',
  colorAggr: 'colorAggr',
  sizeAggr: 'sizeAggr',
} as const;

// Kepler.gl color palettes
export const COLOR_RANGES = {
  // Uber color schemes
  Uber: {
    UberPool: {
      name: 'Uber Pool',
      type: 'sequential',
      category: 'Uber',
      colors: ['#223F9B', '#2C51BE', '#482BBD', '#7A0DA6', '#AE0E7F', '#CF1750', '#E31A1A', '#FD7900', '#FAC200', '#FAE300'],
    },
    UberX: {
      name: 'Uber X',
      type: 'sequential',
      category: 'Uber',
      colors: ['#162C51', '#17396C', '#194785', '#1A549D', '#1B62B2', '#1B70C5', '#1B7ED6', '#1A8CE4', '#1899EF', '#13A7F7', '#04B5FB'],
    },
    UberBlack: {
      name: 'Uber Black',
      type: 'sequential',
      category: 'Uber',
      colors: ['#0F1419', '#1B2126', '#282F36', '#353D47', '#424B59', '#4F5A6C', '#5D6980', '#6B7895', '#7987AA', '#8C95B7', '#A7AEC0'],
    },
  },
  
  // ColorBrewer schemes
  ColorBrewer: {
    // Sequential
    YlGn: {
      name: 'Yellow Green',
      type: 'sequential',
      category: 'ColorBrewer',
      colors: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'],
    },
    YlOrRd: {
      name: 'Yellow Orange Red',
      type: 'sequential',
      category: 'ColorBrewer',
      colors: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
    },
    BuPu: {
      name: 'Blue Purple',
      type: 'sequential',
      category: 'ColorBrewer',
      colors: ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#810f7c', '#4d004b'],
    },
    GnBu: {
      name: 'Green Blue',
      type: 'sequential',
      category: 'ColorBrewer',
      colors: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'],
    },
    OrRd: {
      name: 'Orange Red',
      type: 'sequential',
      category: 'ColorBrewer',
      colors: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#b30000', '#7f0000'],
    },
    PuBuGn: {
      name: 'Purple Blue Green',
      type: 'sequential',
      category: 'ColorBrewer',
      colors: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636'],
    },
    
    // Diverging
    RdBu: {
      name: 'Red Blue',
      type: 'diverging',
      category: 'ColorBrewer',
      colors: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
    },
    RdYlBu: {
      name: 'Red Yellow Blue',
      type: 'diverging',
      category: 'ColorBrewer',
      colors: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
    },
    RdYlGn: {
      name: 'Red Yellow Green',
      type: 'diverging',
      category: 'ColorBrewer',
      colors: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'],
    },
    Spectral: {
      name: 'Spectral',
      type: 'diverging',
      category: 'ColorBrewer',
      colors: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
    },
    
    // Qualitative
    Set1: {
      name: 'Set 1',
      type: 'qualitative',
      category: 'ColorBrewer',
      colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
    },
    Set2: {
      name: 'Set 2',
      type: 'qualitative',
      category: 'ColorBrewer',
      colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    },
    Set3: {
      name: 'Set 3',
      type: 'qualitative',
      category: 'ColorBrewer',
      colors: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
    },
    Paired: {
      name: 'Paired',
      type: 'qualitative',
      category: 'ColorBrewer',
      colors: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
    },
  },
  
  // Custom ranges
  Custom: {
    Sunrise: {
      name: 'Sunrise',
      type: 'sequential',
      category: 'Custom',
      colors: ['#355C7D', '#6C5B7B', '#C06C84', '#F67280', '#F8B195'],
    },
    Ocean: {
      name: 'Ocean',
      type: 'sequential',
      category: 'Custom',
      colors: ['#005C97', '#2A8FBD', '#8FC4E0', '#B9E1FF', '#E8F5FF'],
    },
    Forest: {
      name: 'Forest',
      type: 'sequential',
      category: 'Custom',
      colors: ['#0B3D2E', '#1F5F3F', '#3A8150', '#5FA361', '#8BC572'],
    },
  },
};

// Get flat list of all color ranges
export const getAllColorRanges = () => {
  const ranges: any[] = [];
  Object.values(COLOR_RANGES).forEach(category => {
    Object.values(category).forEach(range => {
      ranges.push(range);
    });
  });
  return ranges;
};

// Default ranges by type
export const DEFAULT_COLOR_RANGES = {
  sequential: COLOR_RANGES.ColorBrewer.YlOrRd,
  diverging: COLOR_RANGES.ColorBrewer.RdBu,
  qualitative: COLOR_RANGES.ColorBrewer.Set2,
};

// Size ranges
export const SIZE_RANGES = {
  default: { min: 0, max: 500 },
  radius: { min: 1, max: 100 },
  height: { min: 0, max: 1000 },
  stroke: { min: 0, max: 20 },
};

// Create scale functions (following d3 patterns used by Kepler.gl)
export const createLinearScale = (domain: [number, number], range: any[]) => {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const scale = (value: number) => {
    const t = (value - d0) / (d1 - d0);
    if (typeof r0 === 'number' && typeof r1 === 'number') {
      return r0 + t * (r1 - r0);
    }
    // For color arrays
    return interpolateColors(r0, r1, t);
  };
  return scale;
};

export const createQuantileScale = (domain: number[], range: any[]) => {
  const sortedDomain = [...domain].sort((a, b) => a - b);
  const step = sortedDomain.length / range.length;
  
  return (value: number) => {
    const index = sortedDomain.findIndex(d => d >= value);
    const rangeIndex = Math.floor(index / step);
    return range[Math.min(rangeIndex, range.length - 1)];
  };
};

export const createOrdinalScale = (domain: string[], range: any[]) => {
  const domainToRange = new Map();
  domain.forEach((d, i) => {
    domainToRange.set(d, range[i % range.length]);
  });
  
  return (value: string) => domainToRange.get(value) || range[0];
};

export const createLogScale = (domain: [number, number], range: any[]) => {
  const [d0, d1] = domain;
  const logD0 = Math.log(Math.max(d0, 0.1));
  const logD1 = Math.log(d1);
  
  return (value: number) => {
    const logValue = Math.log(Math.max(value, 0.1));
    const t = (logValue - logD0) / (logD1 - logD0);
    const [r0, r1] = range;
    
    if (typeof r0 === 'number' && typeof r1 === 'number') {
      return r0 + t * (r1 - r0);
    }
    return interpolateColors(r0, r1, t);
  };
};

export const createSqrtScale = (domain: [number, number], range: any[]) => {
  const [d0, d1] = domain;
  const sqrtD0 = Math.sqrt(Math.max(d0, 0));
  const sqrtD1 = Math.sqrt(d1);
  
  return (value: number) => {
    const sqrtValue = Math.sqrt(Math.max(value, 0));
    const t = (sqrtValue - sqrtD0) / (sqrtD1 - sqrtD0);
    const [r0, r1] = range;
    
    if (typeof r0 === 'number' && typeof r1 === 'number') {
      return r0 + t * (r1 - r0);
    }
    return interpolateColors(r0, r1, t);
  };
};

// Helper function to interpolate between colors
const interpolateColors = (color1: any, color2: any, t: number): [number, number, number] => {
  if (Array.isArray(color1) && Array.isArray(color2)) {
    return [
      Math.round(color1[0] + (color2[0] - color1[0]) * t),
      Math.round(color1[1] + (color2[1] - color1[1]) * t),
      Math.round(color1[2] + (color2[2] - color1[2]) * t),
    ];
  }
  // Handle hex colors
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  return interpolateColors(c1, c2, t);
};

// Convert hex to RGB
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [0, 0, 0];
};

// Convert RGB to hex
export const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

// Get scale function by type
export const getScaleFunction = (type: string, domain: any, range: any): (value: any) => any => {
  switch (type) {
    case SCALE_TYPES.linear:
      return createLinearScale(domain, range);
    case SCALE_TYPES.quantile:
      return createQuantileScale(domain, range);
    case SCALE_TYPES.ordinal:
      return createOrdinalScale(domain, range);
    case SCALE_TYPES.log:
      return createLogScale(domain, range);
    case SCALE_TYPES.sqrt:
      return createSqrtScale(domain, range);
    default:
      return createLinearScale(domain, range);
  }
};
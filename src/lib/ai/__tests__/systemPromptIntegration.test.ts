import { describe, it, expect } from 'vitest';
import { generateSystemPrompt } from '../systemPrompt';
import { getDatasetContext } from '../utils/datasetContext';
import { Dataset } from '@/store/slices/dataSlice';

describe('System Prompt Integration', () => {
  it('should generate system prompt with dataset context', () => {
    const mockDatasets: Dataset[] = [
      {
        id: '1',
        name: 'Cities Data',
        type: 'geojson',
        rowCount: 100,
        columns: [
          { name: 'city_name', type: 'VARCHAR' },
          { name: 'population', type: 'INTEGER' },
          { name: 'geometry', type: 'GEOMETRY', isGeometry: true },
        ],
      },
    ];

    const context = getDatasetContext(mockDatasets);
    const systemPrompt = generateSystemPrompt(context);

    // Verify structure
    expect(systemPrompt).toContain('## Available Data');
    expect(systemPrompt).toContain('The following datasets are loaded and available for analysis:');
    
    // Verify dataset info is included
    expect(systemPrompt).toContain('Cities Data');
    expect(systemPrompt).toContain('cities_data'); // table name
    expect(systemPrompt).toContain('100'); // row count
    expect(systemPrompt).toContain('city_name (VARCHAR)');
    expect(systemPrompt).toContain('population (INTEGER)');
    expect(systemPrompt).toContain('geometry (GEOMETRY)');
    expect(systemPrompt).toContain('Geometry: geometry (GeoJSON)');
    
    // Verify AI instructions
    expect(systemPrompt).toContain('When a user asks about available data:');
    expect(systemPrompt).toContain('Refer to the "Available Data" section above');
  });

  it('should show appropriate message when no datasets are loaded', () => {
    const systemPrompt = generateSystemPrompt();
    
    expect(systemPrompt).toContain('## Available Data');
    expect(systemPrompt).toContain('No datasets are currently loaded. Ask the user to upload data first.');
    expect(systemPrompt).not.toContain('The following datasets are loaded');
  });

  it('should format multiple datasets correctly', () => {
    const mockDatasets: Dataset[] = [
      {
        id: '1',
        name: 'Points of Interest',
        type: 'geojson',
        rowCount: 250,
        columns: [
          { name: 'name', type: 'VARCHAR' },
          { name: 'category', type: 'VARCHAR' },
          { name: 'geom', type: 'GEOMETRY', isGeometry: true },
        ],
      },
      {
        id: '2',
        name: 'Sales Data 2024',
        type: 'csv',
        rowCount: 10000,
        columns: [
          { name: 'date', type: 'DATE' },
          { name: 'revenue', type: 'DOUBLE' },
          { name: 'product_id', type: 'INTEGER' },
        ],
      },
    ];

    const context = getDatasetContext(mockDatasets);
    const systemPrompt = generateSystemPrompt(context);

    // First dataset
    expect(systemPrompt).toContain('1. **Points of Interest** (Table: `points_of_interest`)');
    expect(systemPrompt).toContain('Rows: 250');
    expect(systemPrompt).toContain('Geometry: geom (GeoJSON)');
    
    // Second dataset
    expect(systemPrompt).toContain('2. **Sales Data 2024** (Table: `sales_data_2024`)');
    expect(systemPrompt).toContain('Rows: 10,000');
    expect(systemPrompt).toContain('No geometry column detected');
  });
});

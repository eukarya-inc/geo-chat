import { describe, it, expect } from 'vitest';
import { generateSystemPrompt } from '../systemPrompt';
import { getDatasetContext } from '../utils/datasetContext';
import { Dataset } from '@/store/slices/dataSlice';

describe('Data Availability in AI System', () => {
  it('should include dataset context in system prompt', () => {
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
      {
        id: '2',
        name: 'Sales Report',
        type: 'csv',
        rowCount: 5000,
        columns: [
          { name: 'date', type: 'DATE' },
          { name: 'amount', type: 'DOUBLE' },
          { name: 'region', type: 'VARCHAR' },
        ],
      },
    ];

    const context = getDatasetContext(mockDatasets);
    const systemPrompt = generateSystemPrompt(context);

    // Check that the system prompt includes the dataset information
    expect(systemPrompt).toContain('Cities Data');
    expect(systemPrompt).toContain('Sales Report');
    expect(systemPrompt).toContain('100');
    expect(systemPrompt).toContain('5,000');
    expect(systemPrompt).toContain('geometry (GEOMETRY)');
    expect(systemPrompt).toContain('The following datasets are loaded and available for analysis:');
  });

  it('should generate proper dataset context', () => {
    const mockDatasets: Dataset[] = [
      {
        id: '1',
        name: 'Test GeoJSON',
        type: 'geojson',
        rowCount: 50,
        columns: [
          { name: 'name', type: 'VARCHAR' },
          { name: 'geom', type: 'GEOMETRY', isGeometry: true },
        ],
      },
    ];

    const context = getDatasetContext(mockDatasets);

    expect(context).toContain('Test GeoJSON');
    expect(context).toContain('test_geojson'); // table name
    expect(context).toContain('50');
    expect(context).toContain('name (VARCHAR)');
    expect(context).toContain('geom (GEOMETRY)');
    expect(context).toContain('Geometry: geom (GeoJSON)');
  });

  it('should handle empty datasets', () => {
    const context = getDatasetContext([]);
    const systemPrompt = generateSystemPrompt(context);

    expect(systemPrompt).toContain('No datasets are currently loaded');
  });

  it('should handle datasets without geometry', () => {
    const mockDatasets: Dataset[] = [
      {
        id: '1',
        name: 'Regular CSV',
        type: 'csv',
        rowCount: 1000,
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'value', type: 'DOUBLE' },
        ],
      },
    ];

    const context = getDatasetContext(mockDatasets);

    expect(context).toContain('Regular CSV');
    expect(context).toContain('No geometry column detected');
    expect(context).not.toContain('Geometry:');
  });
});

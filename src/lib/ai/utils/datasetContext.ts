import { Dataset } from '@/store/slices/dataSlice';

/**
 * Generate dataset context for the AI system prompt
 * Similar to kepler.gl's getDatasetContext function
 */
export function getDatasetContext(datasets: Dataset[]): string {
  if (!datasets || datasets.length === 0) {
    return '';
  }

  const dataMeta = datasets.map((dataset) => {
    // Get field information from columns
    const fields = dataset.columns?.reduce((acc: Record<string, string>, column) => {
      acc[column.name] = column.type;
      return acc;
    }, {}) || {};

    // Find geometry column
    const geometryColumn = dataset.columns?.find(col => col.isGeometry)?.name || null;

    return {
      datasetName: dataset.name,
      datasetId: dataset.id,
      tableName: dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      rowCount: dataset.rowCount || 0,
      fields,
      // Add geometry info if available
      geometryColumn,
      geometryType: dataset.type === 'geojson' ? 'GeoJSON' : geometryColumn ? 'geometry' : null,
    };
  });

  const context = `The following datasets are loaded and available for analysis:

${dataMeta.map((meta, index) => `
${index + 1}. **${meta.datasetName}** (Table: \`${meta.tableName}\`)
   - Rows: ${meta.rowCount.toLocaleString()}
   - Fields: ${Object.entries(meta.fields).map(([name, type]) => `${name} (${type})`).join(', ')}
   ${meta.geometryColumn ? `- Geometry: ${meta.geometryColumn} (${meta.geometryType || 'unknown type'})` : '- No geometry column detected'}
`).join('\n')}

You can query these tables using their table names in SQL queries.`;

  return context;
}

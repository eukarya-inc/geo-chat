import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { addDataset } from '../store/slices/layerSlice';
import { Dataset, Field } from '../types/layer.types';

// Map DuckDB types to our field types
const mapDuckDBType = (duckdbType: string): Field['type'] => {
  const type = duckdbType.toLowerCase();
  
  if (type.includes('int') || type.includes('bigint')) return 'integer';
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) return 'real';
  if (type.includes('varchar') || type.includes('text') || type.includes('string')) return 'string';
  if (type.includes('bool')) return 'boolean';
  if (type.includes('date')) return 'date';
  if (type.includes('timestamp')) return 'timestamp';
  if (type.includes('geometry') || type.includes('point') || type.includes('polygon')) return 'geometry';
  
  return 'string'; // default
};

export const useDatasetSync = () => {
  const dispatch = useAppDispatch();
  const { connection: db } = useAppSelector(state => state.duckdb);
  const { tables } = useAppSelector(state => state.data);
  const { datasets } = useAppSelector(state => state.layers);

  useEffect(() => {
    if (!db || tables.length === 0) return;

    const syncDatasets = async () => {
      const conn = await db.connect();

      try {
        for (const table of tables) {
          // Check if dataset already exists
          if (datasets.some(d => d.id === table.name)) continue;

          // Get table schema
          const schemaResult = await conn.query(`DESCRIBE ${table.name}`);
          const schema = schemaResult.toArray();

          // Get sample data for type inference
          const sampleResult = await conn.query(`SELECT * FROM ${table.name} LIMIT 1000`);
          const sampleData = sampleResult.toArray();

          // Create fields from schema
          const fields: Field[] = schema.map(col => ({
            name: col.column_name,
            type: mapDuckDBType(col.column_type),
            format: col.column_type,
          }));

          // Create dataset
          const dataset: Dataset = {
            id: table.name,
            label: table.name,
            color: [
              Math.floor(Math.random() * 255),
              Math.floor(Math.random() * 255),
              Math.floor(Math.random() * 255)
            ],
            allData: sampleData,
            fields,
          };

          dispatch(addDataset(dataset));
        }
      } catch (error) {
        console.error('Error syncing datasets:', error);
      } finally {
        await conn.close();
      }
    };

    syncDatasets();
  }, [db, tables, datasets, dispatch]);
};

// Hook to get full data for a dataset
export const useDatasetData = (datasetId: string) => {
  const dispatch = useAppDispatch();
  const { connection: db } = useAppSelector(state => state.duckdb);
  const dataset = useAppSelector(state => 
    state.layers.datasets.find(d => d.id === datasetId)
  );

  useEffect(() => {
    if (!db || !dataset || dataset.allData.length >= 1000) return;

    const loadFullData = async () => {
      const conn = await db.connect();
      
      try {
        const result = await conn.query(`SELECT * FROM ${datasetId}`);
        const allData = result.toArray();
        
        // Update dataset with full data
        dispatch(addDataset({
          ...dataset,
          allData,
        }));
      } catch (error) {
        console.error('Error loading full dataset:', error);
      } finally {
        await conn.close();
      }
    };

    loadFullData();
  }, [db, dataset, datasetId, dispatch]);

  return dataset;
};
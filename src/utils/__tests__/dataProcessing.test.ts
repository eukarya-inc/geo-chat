import { describe, it, expect } from 'vitest';
import {
  analyzeGeoJSONProperties,
  valueToSQL,
  getSQLType,
  createGeoJSONTableSQL,
  createGeoJSONInsertValues,
} from '../dataProcessing';

describe('dataProcessing', () => {
  describe('analyzeGeoJSONProperties', () => {
    it('should analyze simple property types', () => {
      const features = [
        {
          type: 'Feature',
          properties: {
            name: 'Test',
            population: 1000,
            isCapital: true,
            metadata: { key: 'value' },
          },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ];

      const fields = analyzeGeoJSONProperties(features);
      
      expect(fields).toHaveLength(4);
      expect(fields.find(f => f.name === 'name')).toEqual({
        name: 'name',
        type: 'string',
        nullable: false,
      });
      expect(fields.find(f => f.name === 'population')).toEqual({
        name: 'population',
        type: 'number',
        nullable: false,
      });
      expect(fields.find(f => f.name === 'isCapital')).toEqual({
        name: 'isCapital',
        type: 'boolean',
        nullable: false,
      });
      expect(fields.find(f => f.name === 'metadata')).toEqual({
        name: 'metadata',
        type: 'json',
        nullable: false,
      });
    });

    it('should detect nullable fields', () => {
      const features = [
        {
          type: 'Feature',
          properties: { name: 'A', value: 10 },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
        {
          type: 'Feature',
          properties: { name: 'B' }, // missing 'value'
          geometry: { type: 'Point', coordinates: [1, 1] },
        },
        {
          type: 'Feature',
          properties: { name: 'C', value: null },
          geometry: { type: 'Point', coordinates: [2, 2] },
        },
      ];

      const fields = analyzeGeoJSONProperties(features);
      
      const valueField = fields.find(f => f.name === 'value');
      expect(valueField).toEqual({
        name: 'value',
        type: 'number',
        nullable: true,
      });
    });
  });

  describe('valueToSQL', () => {
    it('should convert values to SQL', () => {
      expect(valueToSQL('test', 'string')).toBe("'test'");
      expect(valueToSQL("test's", 'string')).toBe("'test''s'");
      expect(valueToSQL(42, 'number')).toBe('42');
      expect(valueToSQL(true, 'boolean')).toBe('TRUE');
      expect(valueToSQL(false, 'boolean')).toBe('FALSE');
      expect(valueToSQL({ key: 'value' }, 'json')).toBe("'{\"key\":\"value\"}'::JSON");
      expect(valueToSQL(null, 'string')).toBe('NULL');
      expect(valueToSQL(undefined, 'number')).toBe('NULL');
    });
  });

  describe('getSQLType', () => {
    it('should return correct SQL types', () => {
      expect(getSQLType('string')).toBe('VARCHAR');
      expect(getSQLType('number')).toBe('DOUBLE');
      expect(getSQLType('boolean')).toBe('BOOLEAN');
      expect(getSQLType('json')).toBe('JSON');
      expect(getSQLType('null')).toBe('VARCHAR');
    });
  });

  describe('createGeoJSONTableSQL', () => {
    it('should create proper CREATE TABLE statement', () => {
      const fields = [
        { name: 'name', type: 'string' as const, nullable: false },
        { name: 'population', type: 'number' as const, nullable: true },
      ];

      const sql = createGeoJSONTableSQL('test_table', fields);
      
      expect(sql).toBe(
        'CREATE TABLE test_table (_geojson JSON, "name" VARCHAR, "population" DOUBLE, geom GEOMETRY)'
      );
    });
  });

  describe('createGeoJSONInsertValues', () => {
    it('should create proper INSERT VALUES', () => {
      const features = [
        {
          type: 'Feature',
          properties: { name: 'Test', value: 42 },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ];
      
      const fields = [
        { name: 'name', type: 'string' as const, nullable: false },
        { name: 'value', type: 'number' as const, nullable: false },
      ];

      const values = createGeoJSONInsertValues(features, fields);
      
      expect(values).toContain("'Test'");
      expect(values).toContain('42');
      expect(values).toContain('ST_GeomFromGeoJSON');
      // Check that the feature is serialized as JSON (contains the type)
      expect(values).toContain('"type":"Feature"');
    });
  });
});
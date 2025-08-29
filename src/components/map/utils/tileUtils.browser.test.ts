import { describe, it, expect } from 'vitest';
import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import { geojsonToVectorTile } from './tileUtils';

describe('Vector Tile Numeric Properties', () => {
    it('should handle JSON-encoded values from Map component query', () => {
        const features: Feature<Geometry, GeoJsonProperties>[] = [
            {
                type: 'Feature',
                properties: {
                    population: 123456,
                    density: 789.12,
                    // Don't use BigInt directly in test, as it can't be serialized
                    bigint_value: '9007199254740993',
                    name: 'Test City'
                },
                geometry: {
                    type: 'Point',
                    coordinates: [139.6917, 35.6895]
                }
            }
        ];

        // Use correct tile coordinates for Tokyo (z=10, x=909, y=403)
        const result = geojsonToVectorTile(features, 10, 909, 403);
        
        // Vector tiles should be generated
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);
    });
});
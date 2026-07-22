import { StyleSpecification } from 'maplibre-gl';
import { fixMaplibreExpression } from './maplibreExpressionFixer';

/**
 * Fix property references in MapLibre style
 * Ensures direct property access instead of nested references
 */
export function fixStylePropertyReferences(style: unknown): unknown {
    if (Array.isArray(style)) {
        // Fix nested property access patterns
        if (style[0] === 'get' && style.length === 3 && Array.isArray(style[2])) {
            if (style[2][0] === 'get' && style[2][1] === 'properties') {
                // Pattern: ["get", "propName", ["get", "properties"]]
                return ['get', style[1]];
            }
        }
        if (style[0] === 'get' && style[1] === 'properties' && Array.isArray(style[2])) {
            if (style[2][0] === 'get') {
                // Pattern: ["get", "properties", ["get", "propName"]]
                return ['get', style[2][1]];
            }
        }
        return style.map(fixStylePropertyReferences);
    } else if (style && typeof style === 'object') {
        const fixed: Record<string, unknown> = {};
        for (const key in style) {
            fixed[key] = fixStylePropertyReferences((style as Record<string, unknown>)[key]);
        }
        return fixed;
    }
    return style;
}

/**
 * Process and fix MapLibre style
 */
export function processMapStyle(style: StyleSpecification): StyleSpecification {
    const processedStyle = fixMaplibreExpression(style);
    return fixStylePropertyReferences(processedStyle) as StyleSpecification;
}

/**
 * Update vector source URL in style
 */
export function updateVectorSourceUrl(
    style: StyleSpecification,
    sourceId: string,
    tileUrl: string
): StyleSpecification {
    return {
        ...style,
        sources: {
            ...style.sources,
            [sourceId]: {
                type: 'vector',
                tiles: [tileUrl],
            },
        },
    };
}

/**
 * Create default map style with vector source
 */
export function createDefaultMapStyle(sourceId: string, tileUrl: string): StyleSpecification {
    return {
        version: 8,
        sources: {
            [sourceId]: {
                type: 'vector',
                tiles: [tileUrl],
            },
        },
        layers: [],
    };
}

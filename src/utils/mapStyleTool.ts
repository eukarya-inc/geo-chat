import { MapStyleManager, MapStyleUpdate, parseStyleCommand } from './mapStyleManager';

export interface MapStyleTool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
    };
}

export const mapStyleTool: MapStyleTool = {
    name: 'update_map_style',
    description: 'Update MapLibre GL map styles including colors, opacity, visibility, and other visual properties of map layers',
    parameters: {
        type: 'object',
        properties: {
            update_type: {
                type: 'string',
                enum: ['layer-paint', 'layer-layout', 'layer-filter', 'add-layer', 'remove-layer'],
                description: 'Type of style update to perform',
            },
            layer_id: {
                type: 'string',
                description: "ID of the layer to modify (e.g., 'duckdb-polygons', 'geojson-lines', 'duckdb-points')",
            },
            properties: {
                type: 'object',
                description: "Style properties to update (e.g., {'fill-color': '#ff0000', 'fill-opacity': 0.7})",
            },
            description: {
                type: 'string',
                description: 'Human-readable description of what this style change does',
            },
        },
        required: ['update_type', 'description'],
    },
};

export class MapStyleAIHandler {
    private styleManager: MapStyleManager | null = null;

    setStyleManager(manager: MapStyleManager) {
        this.styleManager = manager;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleStyleUpdate(params: any): { success: boolean; message: string; appliedUpdate?: MapStyleUpdate } {
        if (!this.styleManager) {
            return { success: false, message: 'Map style manager not available' };
        }

        try {
            const update: MapStyleUpdate = {
                type: params.update_type,
                layerId: params.layer_id,
                properties: params.properties,
                filter: params.filter,
                layer: params.layer,
                source: params.source,
                sourceId: params.source_id,
            };

            const success = this.styleManager.applyStyleUpdate(update);

            if (success) {
                return {
                    success: true,
                    message: `Successfully applied style update: ${params.description}`,
                    appliedUpdate: update,
                };
            } else {
                return {
                    success: false,
                    message: `Failed to apply style update: ${params.description}`,
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `Error applying style update: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    parseNaturalLanguageCommand(command: string): MapStyleUpdate | null {
        return parseStyleCommand(command);
    }

    getAvailableLayers(): string[] {
        if (!this.styleManager) return [];
        return this.styleManager.getLayerIds();
    }

    getCurrentStyle(): unknown {
        if (!this.styleManager) return null;
        return this.styleManager.getCurrentStyle();
    }

    generateStyleCommands(userIntent: string): MapStyleUpdate[] {
        const commands: MapStyleUpdate[] = [];
        const intent = userIntent.toLowerCase();

        // Example patterns for common requests
        if (intent.includes('red') && intent.includes('polygon')) {
            commands.push({
                type: 'layer-paint',
                layerId: 'duckdb-polygons',
                properties: { 'fill-color': '#ff0000' },
            });
        }

        if (intent.includes('hide') && intent.includes('line')) {
            commands.push({
                type: 'layer-layout',
                layerId: 'duckdb-lines',
                properties: { visibility: 'none' },
            });
        }

        if (intent.includes('transparent') || intent.includes('opacity')) {
            const opacityMatch = intent.match(/(\d+(?:\.\d+)?)/);
            const opacity = opacityMatch ? parseFloat(opacityMatch[0]) : 0.3;

            commands.push({
                type: 'layer-paint',
                layerId: 'duckdb-polygons',
                properties: { 'fill-opacity': opacity },
            });
        }

        return commands;
    }
}

export const mapStyleAIHandler = new MapStyleAIHandler();

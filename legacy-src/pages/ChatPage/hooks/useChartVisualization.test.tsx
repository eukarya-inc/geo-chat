import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { useChartVisualization } from './useChartVisualization';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import { useHydrateAtoms } from 'jotai/utils';
import { remoteStateAtom, localStateAtom } from '../../../store/atoms';
import type { Chat } from '../../../store/remoteAtoms';
import type { VegaChartSpec } from '../../../types/chart';

interface TestInitialState {
    remote?: unknown;
    local?: unknown;
}

// Test wrapper component with atom initialization
function TestWrapper({ children, initialState }: { children: React.ReactNode; initialState?: TestInitialState }) {
    const HydrateAtoms = ({ children }: { children: React.ReactNode }) => {
        const remoteAtoms = initialState?.remote !== undefined ? [[remoteStateAtom, initialState.remote]] : [];
        const localAtoms = initialState?.local !== undefined ? [[localStateAtom, initialState.local]] : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useHydrateAtoms([...remoteAtoms, ...localAtoms] as any);
        return <>{children}</>;
    };

    return (
        <Provider>
            <HydrateAtoms>{children}</HydrateAtoms>
        </Provider>
    );
}

// Mock DBContext
const createMockDBContext = (): DBContext =>
    ({
        validateTable: vi.fn().mockResolvedValue(true),
    }) as unknown as DBContext;

describe('useChartVisualization', () => {
    let mockDbContext: DBContext;
    const testTableName = 'test_table';
    const testSchemaName = 'test_schema';

    beforeEach(() => {
        mockDbContext = createMockDBContext();
        vi.clearAllMocks();
    });

    describe('Chart Loading', () => {
        it('should load existing chart spec from remote state', async () => {
            const existingChartSpec = {
                id: 'test-chart-1',
                spec: { mark: 'bar', encoding: {}, data: { name: 'test' } } as VegaChartSpec,
                timestamp: new Date(),
                title: 'Existing Chart',
                aiGeneratedSpec: { mark: 'bar', encoding: {}, data: { name: 'test' } } as VegaChartSpec,
            };

            const testChat: Chat = {
                id: 'chat-1',
                title: 'Test Chat',
                createdAt: new Date(),
                selectedTable: testTableName,
                isTitleDefault: true,
                messages: [],
                tables: {},
                chartSpecs: {
                    [testTableName]: existingChartSpec,
                },
            };

            const initialState = {
                remote: {
                    chats: { 'chat-1': testChat },
                    dashboards: {},
                },
                local: {
                    selectedChatId: 'chat-1',
                    sessions: {},
                    selectedDashboardId: null,
                },
            };

            const { result } = renderHook(() => useChartVisualization(testTableName, mockDbContext, testSchemaName), {
                wrapper: ({ children }) => <TestWrapper initialState={initialState}>{children}</TestWrapper>,
            });

            await waitFor(() => {
                expect(result.current.chartSpec).not.toBeNull();
            });

            expect(result.current.chartSpec?.id).toBe('test-chart-1');
            expect(result.current.chartSpec?.title).toBe('Existing Chart');
        });

        it('should clear chart spec when selectedTable is null', async () => {
            const testChat: Chat = {
                id: 'chat-1',
                title: 'Test Chat',
                createdAt: new Date(),
                selectedTable: null,
                isTitleDefault: true,
                messages: [],
                tables: {},
            };

            const initialState = {
                remote: {
                    chats: { 'chat-1': testChat },
                    dashboards: {},
                },
                local: {
                    selectedChatId: 'chat-1',
                    sessions: {},
                    selectedDashboardId: null,
                },
            };

            const { result } = renderHook(() => useChartVisualization(null, mockDbContext, testSchemaName), {
                wrapper: ({ children }) => <TestWrapper initialState={initialState}>{children}</TestWrapper>,
            });

            expect(result.current.chartSpec).toBeNull();
        });
    });

    describe('Chart Deletion', () => {
        it('should delete chart from remote state', async () => {
            const existingChartSpec = {
                id: 'test-chart-1',
                spec: { mark: 'bar', encoding: {}, data: { name: 'test' } } as VegaChartSpec,
                timestamp: new Date(),
                title: 'Chart to Delete',
                aiGeneratedSpec: { mark: 'bar', encoding: {}, data: { name: 'test' } } as VegaChartSpec,
            };

            const testChat: Chat = {
                id: 'chat-1',
                title: 'Test Chat',
                createdAt: new Date(),
                selectedTable: testTableName,
                isTitleDefault: true,
                messages: [],
                tables: {},
                chartSpecs: {
                    [testTableName]: existingChartSpec,
                },
            };

            const initialState = {
                remote: {
                    chats: { 'chat-1': testChat },
                    dashboards: {},
                },
                local: {
                    selectedChatId: 'chat-1',
                    sessions: {},
                    selectedDashboardId: null,
                },
            };

            const { result } = renderHook(() => useChartVisualization(testTableName, mockDbContext, testSchemaName), {
                wrapper: ({ children }) => <TestWrapper initialState={initialState}>{children}</TestWrapper>,
            });

            // Wait for chart to load
            await waitFor(() => {
                expect(result.current.chartSpec).not.toBeNull();
            });

            // Delete the chart
            await result.current.deleteChartFromAI(testTableName);

            // Chart should be cleared after atom updates propagate
            await waitFor(
                () => {
                    expect(result.current.chartSpec).toBeNull();
                },
                { timeout: 1000 }
            );
        });
    });

    describe('Chart Update from AI', () => {
        it('should update chart spec from AI', async () => {
            const existingChartSpec = {
                id: 'test-chart-1',
                spec: { mark: 'bar', encoding: {}, data: { name: 'test' } } as VegaChartSpec,
                timestamp: new Date(),
                title: 'Old Chart',
                aiGeneratedSpec: { mark: 'bar', encoding: {}, data: { name: 'test' } } as VegaChartSpec,
            };

            const testChat: Chat = {
                id: 'chat-1',
                title: 'Test Chat',
                createdAt: new Date(),
                selectedTable: testTableName,
                isTitleDefault: true,
                messages: [],
                tables: {},
                chartSpecs: {
                    [testTableName]: existingChartSpec,
                },
            };

            const initialState = {
                remote: {
                    chats: { 'chat-1': testChat },
                    dashboards: {},
                },
                local: {
                    selectedChatId: 'chat-1',
                    sessions: {},
                    selectedDashboardId: null,
                },
            };

            const { result } = renderHook(() => useChartVisualization(testTableName, mockDbContext, testSchemaName), {
                wrapper: ({ children }) => <TestWrapper initialState={initialState}>{children}</TestWrapper>,
            });

            // Wait for initial chart to load
            await waitFor(() => {
                expect(result.current.chartSpec).not.toBeNull();
            });

            // Delete the chart first
            await result.current.deleteChartFromAI(testTableName);

            await waitFor(() => {
                expect(result.current.chartSpec).toBeNull();
            });

            // Now update with AI - this should clear the deleted flag and allow the chart
            const newSpec = {
                mark: 'line' as const,
                encoding: { x: { field: 'a' } },
                data: { name: 'test' },
                title: 'New Chart from AI',
            } as VegaChartSpec;

            await result.current.updateChartFromAI(testTableName, newSpec);

            await waitFor(() => {
                expect(result.current.chartSpec).not.toBeNull();
            });

            expect(result.current.chartSpec?.title).toBe('New Chart from AI');
        });
    });
});

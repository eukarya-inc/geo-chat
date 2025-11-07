import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type {
    StructuredMessage,
    StructuredContent,
    DuckDBToolInput,
    DuckDBToolResult,
    ErrorContent,
} from '../../types/message';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { RegressionAnalysisResponse, ColumnSummary } from '../../types/regression';
import type { ClusterAnalysisResponse } from '../../types/clustering';
import type { SegmentedRegressionResponse } from '../../types/segmentedRegression';
import type { ChartSpecs } from '../../store/remoteAtoms';
import { formatSQLCompact } from '../../utils/sqlFormatter';
import { TableCreatedMessage } from './TableCreatedMessage';
import { ErrorMessage } from './ErrorMessage';
import { PromptSuggestions } from './PromptSuggestions';
import { CopyButton } from './CopyButton';
import {
    isTableCreatedOnlyMessage,
    removeMetadataMarkers,
    parseSummaryAndDetails,
    parseStreamingSummaryAndDetails,
} from './utils';

interface StructuredMessageRendererProps {
    message: StructuredMessage;
    className?: string;
    dbContext?: DBContext;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    hideToolCalls?: boolean;
    isStreaming?: boolean;
    onPromptClick?: (promptText: string) => void;
    isLoadingMessage?: boolean;
    chartSpecs?: ChartSpecs;
    tableGeometries?: Record<string, boolean>;
    onChartIconClick?: (tableName: string) => void;
    onMapIconClick?: (tableName: string) => void;
    showCopyLabel?: boolean;
}

interface CollapsibleSectionProps {
    title: string;
    children?: React.ReactNode;
    defaultOpen?: boolean;
    isLast?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    children,
    defaultOpen = false,
    isLast = false,
}) => {
    // If no children, render as a simple non-collapsible item
    if (!children) {
        return (
            <div className="my-1 p-1.5">
                <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ children }) => <span>{children}</span>,
                        }}
                    >
                        {title}
                    </ReactMarkdown>
                </div>
            </div>
        );
    }

    return (
        <details className={`group ${isLast ? 'mb-3' : ''}`} open={defaultOpen}>
            <summary className="cursor-pointer list-none flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 rounded-md p-1.5 select-none">
                <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ children }) => <span>{children}</span>,
                        }}
                    >
                        {title}
                    </ReactMarkdown>
                </div>
                <svg
                    className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </summary>
            <div className="pl-2 mt-4">{children}</div>
        </details>
    );
};

const renderContentBlock = (
    block: StructuredContent,
    index: number,
    allContent: StructuredContent[],
    selectedTable?: string | null,
    onTableSelect?: (tableName: string) => void,
    onPromptClick?: (promptText: string) => void,
    isLoadingMessage?: boolean,
    chartSpecs?: ChartSpecs,
    tableGeometries?: Record<string, boolean>,
    onChartIconClick?: (tableName: string) => void,
    onMapIconClick?: (tableName: string) => void,
    showCopyLabel?: boolean
): React.ReactNode => {
    // Check if this is the last collapsible section before text content
    const isLastCollapsibleBeforeText = () => {
        // Check if next element exists and is text type
        const nextBlock = allContent[index + 1];
        return nextBlock?.type === 'text' || index === allContent.length - 1;
    };
    switch (block.type) {
        case 'error': {
            const errorBlock = block as ErrorContent;
            return <ErrorMessage key={index} message={errorBlock.message} />;
        }

        case 'text': {
            // Remove FINAL_MESSAGE, CONTEXT, and TABLE_INFO markers from display
            const cleanedText = block.text
                .replace('<!--FINAL_MESSAGE-->', '')
                .replace(/<!--CONTEXT_START-->[\s\S]*?<!--CONTEXT_END-->/g, '')
                .replace(/<!--TABLE_INFO_START-->[\s\S]*?<!--TABLE_INFO_END-->/g, '')
                .trim();

            // Check if this is a final message (final conclusion)
            const isFinalMessage = block.text.includes('<!--FINAL_MESSAGE-->');

            // Check for summary and details markers
            const parsed = parseSummaryAndDetails(cleanedText);

            // Check for table created markers in text
            const tableCreatedRegex = /<!--TABLE_CREATED:([^:>]+)-->/g;
            const tableMatches = Array.from(cleanedText.matchAll(tableCreatedRegex));

            if (tableMatches.length > 0) {
                const parts: React.ReactNode[] = [];
                let lastIndex = 0;

                tableMatches.forEach((match, i) => {
                    const matchIndex = match.index || 0;
                    const beforeText = cleanedText.slice(lastIndex, matchIndex);

                    if (beforeText.trim()) {
                        parts.push(
                            <div key={`text-${index}-${i}-before`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                    {beforeText}
                                </ReactMarkdown>
                                {isFinalMessage && (
                                    <div className="mt-2 mb-3 flex">
                                        <CopyButton
                                            onCopy={() => navigator.clipboard.writeText(beforeText)}
                                            showLabel={showCopyLabel}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    const tableName = match[1];
                    parts.push(
                        <TableCreatedMessage
                            key={`table-${index}-${i}`}
                            tableName={tableName}
                            isSelected={selectedTable === tableName}
                            onClick={() => onTableSelect?.(tableName)}
                            hasChartSpec={chartSpecs ? tableName in chartSpecs : false}
                            hasGeometry={tableGeometries?.[tableName] || false}
                            onChartIconClick={() => onChartIconClick?.(tableName)}
                            onMapIconClick={() => onMapIconClick?.(tableName)}
                        />
                    );

                    lastIndex = matchIndex + match[0].length;
                });

                // Add remaining text
                const remainingText = cleanedText.slice(lastIndex);
                if (remainingText.trim()) {
                    parts.push(
                        <div key={`text-${index}-end`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                {remainingText}
                            </ReactMarkdown>
                            {isFinalMessage && (
                                <div className="mt-2 mb-3 flex">
                                    <CopyButton
                                        onCopy={() => navigator.clipboard.writeText(remainingText)}
                                        showLabel={showCopyLabel}
                                    />
                                </div>
                            )}
                        </div>
                    );
                }

                return (
                    <div key={index} className="space-y-1">
                        {parts}
                    </div>
                );
            }

            // Handle summary and details if present
            if (parsed.summary && parsed.details) {
                return (
                    <div key={index} className="space-y-2">
                        {/* Summary - always visible */}
                        <div className="prose max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                {parsed.summary}
                            </ReactMarkdown>
                        </div>
                        {/* Details - collapsible */}
                        <CollapsibleSection
                            title="📋 **詳細情報**"
                            defaultOpen={false}
                            isLast={isLastCollapsibleBeforeText()}
                        >
                            <div className="prose prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                    {parsed.details}
                                </ReactMarkdown>
                            </div>
                        </CollapsibleSection>
                        {/* Remaining content if any */}
                        {parsed.remaining && (
                            <div className="prose max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                    {parsed.remaining}
                                </ReactMarkdown>
                            </div>
                        )}
                        {!isLoadingMessage && isFinalMessage && (
                            <div className="mt-2 mb-3 flex">
                                <CopyButton
                                    onCopy={() =>
                                        navigator.clipboard.writeText(
                                            [parsed.summary, parsed.details, parsed.remaining]
                                                .filter(Boolean)
                                                .join('\n\n')
                                        )
                                    }
                                />
                            </div>
                        )}
                    </div>
                );
            }

            // No table markers, render as plain markdown
            if (!cleanedText) return null;

            return (
                <div key={index} className="prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {cleanedText}
                    </ReactMarkdown>
                    {!isLoadingMessage && isFinalMessage && (
                        <div className="mt-2 mb-3 flex">
                            <CopyButton
                                onCopy={() => navigator.clipboard.writeText(cleanedText)}
                                showLabel={showCopyLabel}
                            />
                        </div>
                    )}
                </div>
            );
        }

        case 'tool_use': {
            if (block.name === 'duckdb_query') {
                const input = block.input as DuckDBToolInput;
                const formattedSQL = formatSQLCompact(input.sql);

                return (
                    <CollapsibleSection
                        key={index}
                        title="🔧 **SQL実行中:**"
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                            <code className="language-sql text-xs">{formattedSQL}</code>
                        </pre>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'update_vega_chart_spec_for_table') {
                const input = block.input as { table_name: string; vega_spec: Partial<VegaChartSpec> };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`📊 **グラフ設定を更新中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                            <code className="language-json text-xs">{JSON.stringify(input.vega_spec, null, 2)}</code>
                        </pre>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'get_vega_chart_spec_for_table') {
                const input = block.input as { table_name: string };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`📊 **グラフ設定を取得中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <div className="p-2 text-xs text-gray-600">
                            テーブル「{input.table_name}」のVega-Liteチャート設定を取得しています...
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'select_predictors_for_regression') {
                const input = block.input as {
                    table_name: string;
                    target_column: string;
                    top_k?: number;
                    exclude_columns?: string[];
                    max_rows?: number;
                };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`🔍 **説明変数選択を実行中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <div className="p-2 text-xs space-y-1 text-gray-600">
                            <div>目的変数: {input.target_column}</div>
                            <div>選択数: 上位 {input.top_k ?? 3} 個</div>
                            {input.exclude_columns && input.exclude_columns.length > 0 ? (
                                <div>除外カラム: {input.exclude_columns.join(', ')}</div>
                            ) : null}
                            {input.max_rows ? <div>最大行数: {input.max_rows.toLocaleString()}</div> : null}
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'perform_regression_analysis') {
                const input = block.input as {
                    table_name: string;
                    target_column?: string;
                    explanatory_columns?: string[];
                    max_rows?: number;
                };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`📈 **回帰分析を実行中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <div className="p-2 text-xs space-y-1 text-gray-600">
                            <div>目的変数: {input.target_column ?? '自動選択'}</div>
                            <div>
                                説明変数:{' '}
                                {input.explanatory_columns && input.explanatory_columns.length > 0
                                    ? input.explanatory_columns.join(', ')
                                    : '自動選択'}
                            </div>
                            {input.max_rows ? <div>最大行数: {input.max_rows.toLocaleString()}</div> : null}
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'perform_cluster_analysis') {
                const input = block.input as {
                    table_name: string;
                    feature_columns: string[];
                    k?: number;
                    max_rows?: number;
                };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`🎯 **クラスター分析を実行中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <div className="p-2 text-xs space-y-1 text-gray-600">
                            <div>特徴量: {input.feature_columns.join(', ')}</div>
                            <div>クラスター数: {input.k ?? 3}（デフォルト）</div>
                            {input.max_rows ? <div>最大行数: {input.max_rows.toLocaleString()}</div> : null}
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'update_map_style_for_table') {
                const input = block.input as {
                    table_name: string;
                    geometry_type: string;
                    style_properties: Record<string, unknown>;
                    description: string;
                };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`🗺️ **地図スタイルを更新中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <div className="p-2 text-xs space-y-2">
                            <div className="text-gray-600">
                                <div>ジオメトリタイプ: {input.geometry_type}</div>
                                <div>説明: {input.description}</div>
                            </div>
                            <div>
                                <div className="font-semibold text-gray-700">送信されたJSON:</div>
                                <pre className="mt-1 p-2 bg-gray-100 rounded-md overflow-x-auto">
                                    <code className="language-json text-xs">{JSON.stringify(input, null, 2)}</code>
                                </pre>
                            </div>
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'get_map_style_for_table') {
                const input = block.input as { table_name: string };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`🗺️ **地図スタイルを取得中: ${input.table_name}**`}
                        defaultOpen={false}
                        isLast={isLastCollapsibleBeforeText()}
                    >
                        <div className="p-2 text-xs text-gray-600">
                            テーブル「{input.table_name}」の地図スタイル設定を取得しています...
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'completion') {
                const input = block.input as {
                    suggestedPrompts?: Array<{
                        id?: string;
                        text: string;
                        description?: string;
                    }>;
                    completionMessage?: string;
                };
                if (input?.suggestedPrompts && Array.isArray(input.suggestedPrompts)) {
                    return onPromptClick ? (
                        <PromptSuggestions
                            key={index}
                            prompts={input.suggestedPrompts}
                            onPromptClick={onPromptClick}
                            title="おすすめの質問:"
                        />
                    ) : null;
                }
                return null;
            }
            return null;
        }

        case 'tool_result': {
            // Handle completion tool results (for table creation prompts)
            if (block.name === 'completion') {
                const result = block.result as {
                    suggestedPrompts?: Array<{
                        id?: string;
                        text: string;
                        description?: string;
                    }>;
                    completionMessage?: string;
                };
                // Show suggestions if they exist (table creation case)
                if (result?.suggestedPrompts && Array.isArray(result.suggestedPrompts)) {
                    return onPromptClick ? (
                        <PromptSuggestions
                            key={index}
                            prompts={result.suggestedPrompts}
                            onPromptClick={onPromptClick}
                        />
                    ) : null;
                }
                // If no suggestions, return null
                return null;
            }

            // Handle get_vega_chart_spec_for_table tool results
            if (block.name === 'get_vega_chart_spec_for_table') {
                const result = block.result as { success: boolean; message: string; spec: VegaChartSpec | null };
                if (result?.success) {
                    if (result.spec) {
                        const title = `✅ **${result.message}**`;
                        return (
                            <CollapsibleSection
                                key={index}
                                title={title}
                                defaultOpen={false}
                                isLast={isLastCollapsibleBeforeText()}
                            >
                                <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                                    <code className="language-json text-xs">
                                        {JSON.stringify(result.spec, null, 2)}
                                    </code>
                                </pre>
                            </CollapsibleSection>
                        );
                    } else {
                        return (
                            <CollapsibleSection
                                key={index}
                                title={`ℹ️ **${result.message}**`}
                                isLast={isLastCollapsibleBeforeText()}
                            />
                        );
                    }
                } else {
                    return <ErrorMessage key={index} message={result?.message || 'グラフ設定の取得に失敗しました'} />;
                }
            }

            // Handle update_vega_chart_spec_for_table tool results
            if (block.name === 'update_vega_chart_spec_for_table') {
                const result = block.result as { success: boolean; message: string; tableName?: string };
                if (result?.success) {
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`✅ **${result.message}**`}
                            isLast={isLastCollapsibleBeforeText()}
                        />
                    );
                } else {
                    return <ErrorMessage key={index} message={result?.message || 'グラフの更新に失敗しました'} />;
                }
            }

            // Handle update_map_style_for_table tool results
            if (block.name === 'update_map_style_for_table') {
                const result = block.result as {
                    success: boolean;
                    message: string;
                    error?: string;
                    warnings?: string[];
                    appliedUpdate?: {
                        tableName: string;
                        geometryType: string;
                        layers: Array<{
                            id: string;
                            type: string;
                            paint: Record<string, unknown>;
                        }>;
                    };
                };
                if (result?.success) {
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`✅ **${result.message}**`}
                            isLast={isLastCollapsibleBeforeText()}
                        />
                    );
                } else {
                    return <ErrorMessage key={index} message={result?.error || '地図スタイルの更新に失敗しました'} />;
                }
            }

            if (block.name === 'select_predictors_for_regression') {
                const result = block.result as import('../../types/predictorSelection').PredictorSelectionResponse;
                return renderPredictorSelectionToolResult(result, index);
            }

            if (block.name === 'perform_regression_analysis') {
                const result = block.result as RegressionAnalysisResponse;
                return renderRegressionToolResult(result, index);
            }

            if (block.name === 'perform_cluster_analysis') {
                const result = block.result as ClusterAnalysisResponse;
                return renderClusterToolResult(
                    result,
                    index,
                    selectedTable,
                    onTableSelect,
                    chartSpecs,
                    tableGeometries,
                    onChartIconClick,
                    onMapIconClick
                );
            }

            if (block.name === 'plan_segmented_regression_analysis') {
                const result = block.result as SegmentedRegressionResponse;
                return renderSegmentedRegressionToolResult(result, index);
            }

            // Handle get_map_style_for_table tool results
            if (block.name === 'get_map_style_for_table') {
                const result = block.result as {
                    success: boolean;
                    message?: string;
                    error?: string;
                    tableStyles: unknown[] | null;
                    extraStyle: unknown | null;
                    metadata?: {
                        hasTableStyles: boolean;
                        hasExtraStyle: boolean;
                        layerCount: number;
                        note: string | null;
                    };
                };
                if (result?.success) {
                    const title = result.message ? `✅ **${result.message}**` : '✅ **地図スタイルを取得しました**';
                    return (
                        <CollapsibleSection
                            key={index}
                            title={title}
                            defaultOpen={false}
                            isLast={isLastCollapsibleBeforeText()}
                        >
                            <div className="p-2 text-xs space-y-2">
                                {result.metadata && (
                                    <div className="text-gray-600">
                                        <div>レイヤー数: {result.metadata.layerCount}</div>
                                        {result.metadata.note && (
                                            <div className="mt-1 text-amber-600">{result.metadata.note}</div>
                                        )}
                                    </div>
                                )}
                                {result.tableStyles && result.tableStyles.length > 0 ? (
                                    <div>
                                        <div className="font-semibold text-gray-700">テーブルスタイル:</div>
                                        <pre className="mt-1 p-2 bg-gray-100 rounded-md overflow-x-auto">
                                            <code className="language-json text-xs">
                                                {JSON.stringify(result.tableStyles, null, 2)}
                                            </code>
                                        </pre>
                                    </div>
                                ) : null}
                                {result.extraStyle ? (
                                    <div>
                                        <div className="font-semibold text-gray-700">ベーススタイル:</div>
                                        <pre className="mt-1 p-2 bg-gray-100 rounded-md overflow-x-auto">
                                            <code className="language-json text-xs">
                                                {JSON.stringify(result.extraStyle, null, 2)}
                                            </code>
                                        </pre>
                                    </div>
                                ) : null}
                            </div>
                        </CollapsibleSection>
                    );
                } else {
                    return <ErrorMessage key={index} message={result?.error || '地図スタイルの取得に失敗しました'} />;
                }
            }

            if (block.name === 'duckdb_query') {
                const result = block.result as DuckDBToolResult;

                // Check if this created a table from the result
                const tableCreated = result?.createdTable || null;

                // When a table was created, abbreviate the result display
                if (tableCreated) {
                    // If there's no data or empty data, just show the table creation message
                    if (!result?.data || (Array.isArray(result.data) && result.data.length === 0)) {
                        return (
                            <TableCreatedMessage
                                key={index}
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                                hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                                hasGeometry={tableGeometries?.[tableCreated] || false}
                                onChartIconClick={() => onChartIconClick?.(tableCreated)}
                                onMapIconClick={() => onMapIconClick?.(tableCreated)}
                            />
                        );
                    }

                    // If it's just a single row with Count or similar, just show table created message
                    const data = Array.isArray(result.data) ? result.data : [result.data];
                    if (
                        data.length === 1 &&
                        data[0] &&
                        typeof data[0] === 'object' &&
                        Object.keys(data[0]).length === 1
                    ) {
                        return (
                            <TableCreatedMessage
                                key={index}
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                                hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                                hasGeometry={tableGeometries?.[tableCreated] || false}
                                onChartIconClick={() => onChartIconClick?.(tableCreated)}
                                onMapIconClick={() => onMapIconClick?.(tableCreated)}
                            />
                        );
                    }
                }

                if (result?.error) {
                    const errorMsg = String(result.error);
                    return <ErrorMessage key={index} message={errorMsg} />;
                }

                if (result?.data) {
                    const data = Array.isArray(result.data) ? result.data : [result.data];
                    const rowCount = data.length;

                    let displayData = data;
                    let title = `✅ **結果:** (${rowCount}行)`;
                    let summary = '';

                    if (rowCount > 100) {
                        const firstRows = data.slice(0, 3);
                        const lastRows = data.slice(-2);
                        displayData = [...firstRows, { '...': `${rowCount - 5} more rows` }, ...lastRows];
                        title = `✅ **結果:** (${rowCount}行 - 抜粋表示)`;
                        summary = `📊 **データサマリー:** 全${rowCount}行のうち最初の3行と最後の2行を表示。`;
                    } else if (rowCount > 20) {
                        displayData = data.slice(0, 10);
                        title = `✅ **結果:** (${rowCount}行 - 最初の10行を表示)`;
                        summary = `📋 残り${rowCount - 10}行があります。`;
                    }

                    const dataStr = JSON.stringify(displayData, null, 2);
                    const isLongData = dataStr.length > 8000;
                    const displayStr = isLongData ? dataStr.substring(0, 8000) + '...' : dataStr;

                    return (
                        <CollapsibleSection
                            key={index}
                            title={title}
                            defaultOpen={false}
                            isLast={isLastCollapsibleBeforeText()}
                        >
                            <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                                <code className="text-xs">{displayStr}</code>
                            </pre>
                            {summary && (
                                <div className="mt-1 text-xs text-gray-600">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                                </div>
                            )}
                            {result.sqlExplanation && (
                                <div className="mt-1.5 prose prose-xs text-xs">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {`📝 **SQL解説:**\n${result.sqlExplanation}`}
                                    </ReactMarkdown>
                                </div>
                            )}
                            {tableCreated && (
                                <TableCreatedMessage
                                    tableName={tableCreated}
                                    isSelected={selectedTable === tableCreated}
                                    onClick={() => onTableSelect?.(tableCreated)}
                                    hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                                    hasGeometry={tableGeometries?.[tableCreated] || false}
                                    onChartIconClick={() => onChartIconClick?.(tableCreated)}
                                    onMapIconClick={() => onMapIconClick?.(tableCreated)}
                                />
                            )}
                        </CollapsibleSection>
                    );
                }
            }
            return null;
        }

        default:
            return null;
    }
};

function renderPredictorSelectionToolResult(
    result: import('../../types/predictorSelection').PredictorSelectionResponse | undefined,
    key: number
): React.ReactNode {
    if (!result) {
        return (
            <CollapsibleSection key={key} title="❌ **説明変数選択の結果を取得できませんでした**" defaultOpen={false}>
                <div className="p-2 text-xs text-red-600">結果オブジェクトが未定義です。</div>
            </CollapsibleSection>
        );
    }

    if (!result.success) {
        return (
            <CollapsibleSection key={key} title="❌ **説明変数選択に失敗しました**" defaultOpen>
                <div className="p-2 text-xs space-y-1 text-red-600">
                    <div>{result.message}</div>
                    {result.warnings && result.warnings.length > 0 ? (
                        <ul className="list-disc list-inside text-amber-500">
                            {result.warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </CollapsibleSection>
        );
    }

    const {
        tableName,
        targetColumn,
        selectedPredictors,
        predictorCorrelations,
        excludedPredictors,
        candidateCount,
        topK,
        warnings,
    } = result;

    return (
        <CollapsibleSection key={key} title={`🔍 **説明変数選択結果: ${targetColumn}**`} defaultOpen>
            <div className="p-2 text-xs space-y-3 text-gray-700">
                <div className="space-y-1">
                    <div className="font-semibold text-gray-800">選択結果</div>
                    <div>
                        テーブル: <span className="font-medium">{tableName}</span>
                    </div>
                    <div>
                        目的変数: <span className="font-medium">{targetColumn}</span>
                    </div>
                    <div>
                        候補カラム数: <span className="font-medium">{candidateCount}</span> 個
                    </div>
                    <div>
                        選択数: 上位 <span className="font-medium">{topK}</span> 個
                    </div>
                    <div className="leading-relaxed">
                        選択された説明変数:{' '}
                        <span className="font-medium bg-blue-50 px-1 py-0.5 rounded">
                            {selectedPredictors.join(', ')}
                        </span>
                    </div>
                </div>

                {predictorCorrelations && predictorCorrelations.length > 0 ? (
                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">相関スコア</div>
                        <div className="overflow-x-auto border border-gray-200 rounded">
                            <table className="min-w-[400px] table-fixed border-collapse">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="py-1 px-2 text-left font-semibold">説明変数</th>
                                        <th className="py-1 px-2 text-right font-semibold">相関係数</th>
                                        <th className="py-1 px-2 text-right font-semibold">絶対値</th>
                                        <th className="py-1 px-2 text-right font-semibold">ペア数</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {predictorCorrelations.map(corr => (
                                        <tr key={corr.predictor} className="border-t border-gray-200">
                                            <td className="py-1 px-2 text-left">{corr.predictor}</td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(corr.correlation)}
                                            </td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(corr.absoluteCorrelation)}
                                            </td>
                                            <td className="py-1 px-2 text-right">{formatInteger(corr.pairCount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}

                {excludedPredictors && excludedPredictors.length > 0 ? (
                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">除外された説明変数</div>
                        <div className="overflow-x-auto border border-gray-200 rounded">
                            <table className="min-w-[480px] table-fixed border-collapse">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="py-1 px-2 text-left font-semibold">説明変数</th>
                                        <th className="py-1 px-2 text-right font-semibold">相関係数</th>
                                        <th className="py-1 px-2 text-left font-semibold">理由</th>
                                        <th className="py-1 px-2 text-left font-semibold">詳細</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {excludedPredictors.map((exc, idx) => (
                                        <tr key={idx} className="border-t border-gray-200">
                                            <td className="py-1 px-2 text-left">{exc.predictor}</td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(exc.correlation)}
                                            </td>
                                            <td className="py-1 px-2 text-left">
                                                {exc.reason === 'high_correlation'
                                                    ? '高相関'
                                                    : exc.reason === 'user_excluded'
                                                      ? 'ユーザー指定'
                                                      : 'データ不足'}
                                            </td>
                                            <td className="py-1 px-2 text-left text-xs">{exc.details || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}

                {warnings && warnings.length > 0 ? (
                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">注意事項</div>
                        <ul className="list-disc list-inside text-amber-600">
                            {warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </CollapsibleSection>
    );
}

function renderRegressionToolResult(result: RegressionAnalysisResponse | undefined, key: number): React.ReactNode {
    if (!result) {
        return (
            <CollapsibleSection key={key} title="❌ **回帰分析の結果を取得できませんでした**" defaultOpen={false}>
                <div className="p-2 text-xs text-red-600">結果オブジェクトが未定義です。</div>
            </CollapsibleSection>
        );
    }

    if (!result.success) {
        return (
            <CollapsibleSection key={key} title="❌ **回帰分析に失敗しました**" defaultOpen>
                <div className="p-2 text-xs space-y-1 text-red-600">
                    <div>{result.message}</div>
                    {result.warnings && result.warnings.length > 0 ? (
                        <ul className="list-disc list-inside text-red-500">
                            {result.warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </CollapsibleSection>
        );
    }

    const { regression, targetColumn, predictorColumns, dataInfo, columnSummaries, warnings } = result;
    const orderedColumns = [targetColumn, ...predictorColumns];
    const columnSummaryRows = orderedColumns
        .map(column => columnSummaries[column])
        .filter((summary): summary is ColumnSummary => Boolean(summary));

    return (
        <CollapsibleSection key={key} title={`📈 **回帰分析結果: ${targetColumn}**`} defaultOpen>
            <div className="p-2 text-xs space-y-3 text-gray-700">
                <div className="space-y-1">
                    <div className="font-semibold text-gray-800">モデル概要</div>
                    <div>
                        目的変数: <span className="font-medium">{targetColumn}</span>
                    </div>
                    <div className="leading-relaxed">
                        説明変数: <span className="font-medium">{predictorColumns.join(', ')}</span>
                    </div>
                    <div className="leading-relaxed">
                        使用行数: <span className="font-medium">{formatInteger(dataInfo.usedRows)}</span> /{' '}
                        {formatInteger(dataInfo.totalRows)}（除外 {formatInteger(dataInfo.skippedRows)} 行）
                    </div>
                    <div className="leading-relaxed">
                        回帰式:{' '}
                        <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">{regression.equation}</code>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="font-semibold text-gray-800">統計量</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                        <div>R²: {formatRegressionNumber(regression.r2)}</div>
                        <div>調整R²: {formatRegressionNumber(regression.adjustedR2)}</div>
                        <div>F統計量: {formatRegressionNumber(regression.fStatistic)}</div>
                        <div>自由度（モデル）: {formatInteger(regression.dfModel)}</div>
                        <div>自由度（残差）: {formatInteger(regression.dfResidual)}</div>
                        <div>残差標準誤差: {formatRegressionNumber(regression.residualStandardError)}</div>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="font-semibold text-gray-800">係数と検定結果</div>
                    <div className="overflow-x-auto border border-gray-200 rounded">
                        <table className="min-w-[560px] table-fixed border-collapse">
                            <thead className="bg-gray-100 text-gray-700">
                                <tr>
                                    <th className="py-1 px-2 text-left font-semibold">変数</th>
                                    <th className="py-1 px-2 text-right font-semibold">係数</th>
                                    <th className="py-1 px-2 text-right font-semibold">標準誤差</th>
                                    <th className="py-1 px-2 text-right font-semibold">t値</th>
                                    <th className="py-1 px-2 text-right font-semibold">p値</th>
                                    <th className="py-1 px-2 text-right font-semibold">VIF</th>
                                    <th className="py-1 px-2 text-right font-semibold">相関係数</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-t border-gray-200">
                                    <td className="py-1 px-2 text-left">切片</td>
                                    <td className="py-1 px-2 text-right">
                                        {formatRegressionNumber(regression.coefficients.intercept)}
                                    </td>
                                    <td className="py-1 px-2 text-right">—</td>
                                    <td className="py-1 px-2 text-right">—</td>
                                    <td className="py-1 px-2 text-right">—</td>
                                    <td className="py-1 px-2 text-right">—</td>
                                    <td className="py-1 px-2 text-right">—</td>
                                </tr>
                                {regression.metricsPerPredictor.map(metric => (
                                    <tr key={metric.name} className="border-t border-gray-200">
                                        <td className="py-1 px-2 text-left">{metric.name}</td>
                                        <td className="py-1 px-2 text-right">{formatRegressionNumber(metric.beta)}</td>
                                        <td className="py-1 px-2 text-right">
                                            {formatRegressionNumber(metric.standardError)}
                                        </td>
                                        <td className="py-1 px-2 text-right">
                                            {formatRegressionNumber(metric.tStatistic)}
                                        </td>
                                        <td className="py-1 px-2 text-right">{formatPValue(metric.pValue)}</td>
                                        <td className="py-1 px-2 text-right">
                                            {formatRegressionNumber(metric.vif ?? Number.NaN)}
                                        </td>
                                        <td className="py-1 px-2 text-right">
                                            {formatRegressionNumber(metric.correlation)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {columnSummaryRows.length > 0 ? (
                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">カラム統計</div>
                        <div className="overflow-x-auto border border-gray-200 rounded">
                            <table className="min-w-[520px] table-fixed border-collapse">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="py-1 px-2 text-left font-semibold">カラム</th>
                                        <th className="py-1 px-2 text-right font-semibold">件数</th>
                                        <th className="py-1 px-2 text-right font-semibold">平均</th>
                                        <th className="py-1 px-2 text-right font-semibold">最小</th>
                                        <th className="py-1 px-2 text-right font-semibold">最大</th>
                                        <th className="py-1 px-2 text-right font-semibold">標準偏差</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {columnSummaryRows.map(summary => (
                                        <tr key={summary.column} className="border-t border-gray-200">
                                            <td className="py-1 px-2 text-left">{summary.column}</td>
                                            <td className="py-1 px-2 text-right">{formatInteger(summary.count)}</td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(summary.mean)}
                                            </td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(summary.min)}
                                            </td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(summary.max)}
                                            </td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber(summary.stdDev)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}

                {warnings && warnings.length > 0 ? (
                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">注意事項</div>
                        <ul className="list-disc list-inside text-amber-600">
                            {warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </CollapsibleSection>
    );
}

function formatRegressionNumber(value: number, digits = 4): string {
    if (!Number.isFinite(value)) return '—';
    const absValue = Math.abs(value);

    // For very large numbers (>= 10000), use comma separators
    if (absValue >= 10_000) {
        return value.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: digits,
        });
    }

    // For very small numbers, use exponential notation
    if (absValue !== 0 && absValue < 10 ** -digits) {
        return value.toExponential(2);
    }

    // For normal range numbers, use fixed decimal places
    return Number(value.toFixed(digits)).toString();
}

function formatPValue(value: number): string {
    if (!Number.isFinite(value)) return '—';
    if (value < 0.0001) return '<0.0001';
    return value.toPrecision(3);
}

function formatInteger(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return Math.round(value).toLocaleString();
}

function renderClusterToolResult(
    result: ClusterAnalysisResponse | undefined,
    key: number,
    selectedTable?: string | null,
    onTableSelect?: (tableName: string) => void,
    chartSpecs?: ChartSpecs,
    tableGeometries?: Record<string, boolean>,
    onChartIconClick?: (tableName: string) => void,
    onMapIconClick?: (tableName: string) => void
): React.ReactNode {
    if (!result) {
        return (
            <CollapsibleSection key={key} title="❌ **クラスター分析の結果を取得できませんでした**" defaultOpen={false}>
                <div className="p-2 text-xs text-red-600">結果オブジェクトが未定義です。</div>
            </CollapsibleSection>
        );
    }

    if (!result.success) {
        return (
            <CollapsibleSection key={key} title="❌ **クラスター分析に失敗しました**" defaultOpen>
                <div className="p-2 text-xs space-y-1 text-red-600">
                    <div>{result.message}</div>
                    {result.warnings && result.warnings.length > 0 ? (
                        <ul className="list-disc list-inside text-red-500">
                            {result.warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </CollapsibleSection>
        );
    }

    const { metrics, diagnostics, featureColumns, dataInfo, warnings, labelsTableName } = result;

    return (
        <>
            <CollapsibleSection
                key={key}
                title={`🎯 **クラスター分析結果: ${metrics.numClusters}グループに分類**`}
                defaultOpen
            >
                <div className="p-2 text-xs space-y-3 text-gray-700">
                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">分析概要</div>
                        <div>
                            特徴量: <span className="font-medium">{featureColumns.join(', ')}</span>
                        </div>
                        <div className="leading-relaxed">
                            クラスター数: <span className="font-medium">{metrics.numClusters}</span>
                        </div>
                        <div className="leading-relaxed">
                            使用データ数: <span className="font-medium">{formatInteger(dataInfo.usedRows)}</span> /{' '}
                            {formatInteger(dataInfo.totalRows)}（除外 {formatInteger(dataInfo.skippedRows)} 行）
                        </div>
                        <div className="leading-relaxed">
                            収束状態:{' '}
                            <span
                                className={
                                    metrics.converged ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'
                                }
                            >
                                {metrics.converged ? '✓ 収束' : '△ 未収束'}{' '}
                                <span className="text-gray-600 font-normal">（{diagnostics.iterations}回反復）</span>
                            </span>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">品質指標</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <div>
                                Silhouette Score:{' '}
                                <span
                                    className={
                                        metrics.silhouetteScore > 0.7
                                            ? 'font-medium text-green-600'
                                            : metrics.silhouetteScore > 0.5
                                              ? 'font-medium text-blue-600'
                                              : metrics.silhouetteScore > 0.25
                                                ? 'font-medium text-amber-600'
                                                : 'font-medium text-red-600'
                                    }
                                >
                                    {formatRegressionNumber(metrics.silhouetteScore, 3)}
                                </span>
                            </div>
                            <div>Inertia (WCSS): {formatRegressionNumber(metrics.inertia, 2)}</div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {metrics.silhouetteScore > 0.7
                                ? '優れたクラスタリング品質です'
                                : metrics.silhouetteScore > 0.5
                                  ? '良好なクラスタリング品質です'
                                  : metrics.silhouetteScore > 0.25
                                    ? '中程度のクラスタリング品質です'
                                    : 'クラスタリング品質が低いです'}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">クラスターサイズ</div>
                        <div className="overflow-x-auto border border-gray-200 rounded">
                            <table className="min-w-full table-auto border-collapse">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="py-1 px-2 text-left font-semibold">クラスター</th>
                                        <th className="py-1 px-2 text-right font-semibold">データ数</th>
                                        <th className="py-1 px-2 text-right font-semibold">割合</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metrics.clusterSizes.map((size: number, idx: number) => (
                                        <tr key={idx} className="border-t border-gray-200">
                                            <td className="py-1 px-2 text-left">クラスター {idx}</td>
                                            <td className="py-1 px-2 text-right">{formatInteger(size)}</td>
                                            <td className="py-1 px-2 text-right">
                                                {formatRegressionNumber((size / metrics.numSamples) * 100, 1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="font-semibold text-gray-800">クラスター中心座標</div>
                        <div className="overflow-x-auto border border-gray-200 rounded">
                            <table className="min-w-full table-auto border-collapse">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="py-1 px-2 text-left font-semibold">クラスター</th>
                                        {metrics.featureNames.map((name: string, idx: number) => (
                                            <th key={idx} className="py-1 px-2 text-right font-semibold">
                                                {name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {diagnostics.centroids.map((centroid: number[], idx: number) => (
                                        <tr key={idx} className="border-t border-gray-200">
                                            <td className="py-1 px-2 text-left">クラスター {idx}</td>
                                            {centroid.map((value: number, valueIdx: number) => (
                                                <td key={valueIdx} className="py-1 px-2 text-right">
                                                    {formatRegressionNumber(value, 2)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {(diagnostics.timing || diagnostics.sampleInfo) && (
                        <div className="space-y-1">
                            <div className="font-semibold text-gray-800">処理情報</div>
                            <div className="space-y-1 text-gray-600">
                                {diagnostics.sampleInfo && (
                                    <div>
                                        学習サンプル数: {formatInteger(diagnostics.sampleInfo.sampleSize)} /{' '}
                                        {formatInteger(diagnostics.sampleInfo.totalSize)} (
                                        {formatRegressionNumber(diagnostics.sampleInfo.sampleRatio * 100, 1)}%)
                                    </div>
                                )}
                                {diagnostics.timing && (
                                    <div className="grid grid-cols-3 gap-x-4">
                                        {diagnostics.timing.totalMs && (
                                            <div>
                                                総処理時間: {formatRegressionNumber(diagnostics.timing.totalMs, 0)}ms
                                            </div>
                                        )}
                                        {diagnostics.timing.initializationMs !== undefined && (
                                            <div>
                                                初期化: {formatRegressionNumber(diagnostics.timing.initializationMs, 0)}
                                                ms
                                            </div>
                                        )}
                                        {diagnostics.timing.reclusteringMs !== undefined && (
                                            <div>
                                                再計算: {formatRegressionNumber(diagnostics.timing.reclusteringMs, 0)}ms
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {warnings && warnings.length > 0 ? (
                        <div className="space-y-1">
                            <div className="font-semibold text-gray-800">注意事項</div>
                            <ul className="list-disc list-inside text-amber-600">
                                {warnings.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            </CollapsibleSection>
            {labelsTableName && onTableSelect && (
                <div className="mt-2">
                    <TableCreatedMessage
                        tableName={labelsTableName}
                        isSelected={selectedTable === labelsTableName}
                        onClick={() => onTableSelect(labelsTableName)}
                        hasChartSpec={chartSpecs ? labelsTableName in chartSpecs : false}
                        hasGeometry={tableGeometries?.[labelsTableName] || false}
                        onChartIconClick={() => onChartIconClick?.(labelsTableName)}
                        onMapIconClick={() => onMapIconClick?.(labelsTableName)}
                    />
                </div>
            )}
        </>
    );
}

export const StructuredMessageRenderer: React.FC<StructuredMessageRendererProps> = ({
    message,
    className,
    selectedTable,
    onTableSelect,
    hideToolCalls = false,
    isStreaming = false,
    onPromptClick,
    isLoadingMessage = false,
    chartSpecs,
    tableGeometries,
    onChartIconClick,
    onMapIconClick,
    showCopyLabel,
}) => {
    // Handle structured content with optional streaming text
    if (Array.isArray(message.content)) {
        // Filter content based on hideToolCalls flag
        let filteredContent = message.content;

        if (hideToolCalls) {
            // Find the index of the last text block
            let lastTextIndex = -1;
            for (let i = message.content.length - 1; i >= 0; i--) {
                if (message.content[i].type === 'text') {
                    lastTextIndex = i;
                    break;
                }
            }

            // Filter to keep only:
            // 1. Error messages - ALWAYS show
            // 2. Table creation messages (tool_result with createdTable) - ALWAYS show
            // 3. Completion tool use (suggested prompts) - ALWAYS show
            // 4. The last text message (only when not streaming)
            // 5. Text blocks with TABLE_CREATED markers - ALWAYS show
            // Note: SQL results and chart update results are hidden when collapsed
            filteredContent = message.content.filter((block, index) => {
                // Always keep error messages even when collapsed
                if (block.type === 'error') {
                    return true;
                }

                // Always keep completion tool use (suggested prompts)
                if (block.type === 'tool_use' && block.name === 'completion') {
                    return true;
                }

                // Always keep completion tool result (suggested prompts from AIStore)
                if (block.type === 'tool_result' && block.name === 'completion') {
                    return true;
                }

                // Only keep table creation tool results and errors, not all SQL results
                if (block.type === 'tool_result' && block.name === 'duckdb_query') {
                    const result = block.result as DuckDBToolResult;
                    // Always show if it created a table
                    if (result?.createdTable) return true;
                    // Always show errors even when collapsed
                    if (result?.error) return true;
                    // Hide regular SQL results when collapsed
                    return false;
                }

                // Hide chart update tool results when collapsed
                // (Don't include update_vega_chart_spec_for_table here)

                // Keep text blocks based on conditions
                if (block.type === 'text') {
                    const hasTableMarker = block.text.includes('<!--TABLE_CREATED:');
                    const hasFinalMarker = block.text.includes('<!--FINAL_MESSAGE-->');
                    const hasSummary = block.text.includes('<!--SUMMARY-->');
                    const hasDetails = block.text.includes('<!--DETAILS-->');

                    // Always show table markers, final messages, summaries, and details
                    if (hasTableMarker || hasFinalMarker || hasSummary || hasDetails) return true;

                    // Only show last text when not streaming
                    const isLastText = index === lastTextIndex;
                    if (isLastText && !isStreaming) {
                        // Don't show if it's empty
                        if (block.text.trim() === '') return false;
                        return true;
                    }
                }

                // Hide everything else (tool_use blocks)
                return false;
            });
        }

        return (
            <div className={className}>
                {/* Render existing structured content blocks */}
                {filteredContent.map((block, index) =>
                    renderContentBlock(
                        block,
                        index,
                        filteredContent,
                        selectedTable,
                        onTableSelect,
                        onPromptClick,
                        isLoadingMessage,
                        chartSpecs,
                        tableGeometries,
                        onChartIconClick,
                        onMapIconClick,
                        showCopyLabel
                    )
                )}

                {/* Render streaming text if present */}
                {message.streaming &&
                    (() => {
                        // Check if this is a final message
                        const isFinalMessage = message.streaming.includes('<!--FINAL_MESSAGE-->');

                        // Show streaming text if:
                        // 1. Not hiding tool calls, OR
                        // 2. It's a final message (always show final messages even when collapsed)
                        if (!hideToolCalls || isFinalMessage) {
                            // Remove the FINAL_MESSAGE marker from display
                            const displayText = message.streaming.replace('<!--FINAL_MESSAGE-->', '').trim();

                            if (displayText) {
                                // Use streaming parser to detect summary and details markers
                                const parsed = parseStreamingSummaryAndDetails(displayText);

                                // If we have summary or details markers, render with structure
                                if (parsed.hasSummary || parsed.hasDetails) {
                                    return (
                                        <div className="space-y-2">
                                            {/* Remaining content before summary */}
                                            {parsed.remaining && !parsed.hasSummary && (
                                                <div className="prose max-w-none">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm]}
                                                        rehypePlugins={[rehypeHighlight]}
                                                    >
                                                        {parsed.remaining}
                                                    </ReactMarkdown>
                                                </div>
                                            )}

                                            {/* Summary section (always visible when available) */}
                                            {parsed.summary && (
                                                <div className="prose max-w-none">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm]}
                                                        rehypePlugins={[rehypeHighlight]}
                                                    >
                                                        {parsed.summary}
                                                    </ReactMarkdown>
                                                </div>
                                            )}

                                            {/* Details section (collapsible, created immediately when marker appears) */}
                                            {parsed.hasDetails && (
                                                <CollapsibleSection title="📋 **詳細情報**" defaultOpen={false}>
                                                    <div className="prose prose-sm max-w-none">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            rehypePlugins={[rehypeHighlight]}
                                                        >
                                                            {parsed.details}
                                                        </ReactMarkdown>
                                                    </div>
                                                </CollapsibleSection>
                                            )}

                                            {/* Remaining content after summary (if applicable) */}
                                            {parsed.remaining && parsed.hasSummary && (
                                                <div className="prose max-w-none">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm]}
                                                        rehypePlugins={[rehypeHighlight]}
                                                    >
                                                        {parsed.remaining}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // No markers found, render as plain text
                                return (
                                    <div className="prose max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                            {displayText}
                                        </ReactMarkdown>
                                    </div>
                                );
                            }
                        }
                        return null;
                    })()}
            </div>
        );
    }

    // Handle plain string content (for user messages)
    // Remove metadata markers for display
    const stringContent = removeMetadataMarkers(message.content as string);
    const tableCreatedRegex = /<!--TABLE_CREATED:([^:>]+)-->/g;
    const tableMatches = Array.from(stringContent.matchAll(tableCreatedRegex));

    if (tableMatches.length > 0) {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;

        tableMatches.forEach((match, i) => {
            const matchIndex = match.index || 0;
            const beforeText = stringContent.slice(lastIndex, matchIndex);

            if (beforeText.trim()) {
                parts.push(
                    <div key={`text-${i}-before`} className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {beforeText}
                        </ReactMarkdown>
                    </div>
                );
            }

            const tableName = match[1];
            parts.push(
                <TableCreatedMessage
                    key={`table-${i}`}
                    tableName={tableName}
                    isSelected={selectedTable === tableName}
                    onClick={() => onTableSelect?.(tableName)}
                    hasChartSpec={chartSpecs ? tableName in chartSpecs : false}
                    hasGeometry={tableGeometries?.[tableName] || false}
                    onChartIconClick={() => onChartIconClick?.(tableName)}
                    onMapIconClick={() => onMapIconClick?.(tableName)}
                />
            );

            lastIndex = matchIndex + match[0].length;
        });

        // Add remaining text
        const remainingText = stringContent.slice(lastIndex);
        if (remainingText.trim()) {
            parts.push(
                <div key={`text-end`} className="prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {remainingText}
                    </ReactMarkdown>
                </div>
            );
        }

        // Check if this message only contains TABLE_CREATED markers using shared utility
        if (isTableCreatedOnlyMessage(message.content as string)) {
            // This message ONLY contains TABLE_CREATED markers, no other text
            // Render without bubble styling
            return <div className="space-y-1">{parts}</div>;
        }

        return <div className={className}>{parts}</div>;
    }

    // No table markers, render as plain markdown
    // But don't render if the content is empty after removing context
    if (!stringContent) {
        return null;
    }

    return (
        <div className={className}>
            <div className="prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {stringContent}
                </ReactMarkdown>
            </div>
        </div>
    );
};

function renderSegmentedRegressionToolResult(
    result: SegmentedRegressionResponse | undefined,
    key: number
): React.ReactNode {
    if (!result) {
        return <CollapsibleSection key={key} title="❌ **セグメント別回帰分析プランの結果がありません**" />;
    }

    if (!result.success) {
        return (
            <CollapsibleSection key={key} title={`❌ **エラー:** ${result.message}`} defaultOpen={true}>
                {result.warnings && result.warnings.length > 0 && (
                    <div className="text-sm text-amber-600 space-y-1">
                        {result.warnings.map((warning, idx) => (
                            <div key={idx}>⚠️ {warning}</div>
                        ))}
                    </div>
                )}
            </CollapsibleSection>
        );
    }

    const { plan } = result;
    const title = `📋 **セグメント別回帰分析プラン: ${plan.totalSegments}セグメント、${plan.totalSteps}ステップ**`;

    return (
        <CollapsibleSection key={key} title={title} defaultOpen={true}>
            <div className="space-y-4 text-sm">
                {/* Summary */}
                <div className="p-3 bg-blue-50 rounded-md">
                    <div className="font-semibold text-blue-900 mb-2">📊 実行プラン概要</div>
                    <div className="space-y-1 text-blue-800">
                        <div>
                            ソーステーブル: <code>{plan.sourceTable}</code>
                        </div>
                        <div>
                            セグメント列: <code>{plan.segmentColumn}</code>
                        </div>
                        {plan.targetColumn && (
                            <div>
                                目的変数: <code>{plan.targetColumn}</code>
                            </div>
                        )}
                        {plan.predictorColumns && plan.predictorColumns.length > 0 && (
                            <div>
                                説明変数: <code>{plan.predictorColumns.join(', ')}</code>
                            </div>
                        )}
                        <div className="mt-2 font-medium">
                            合計: {plan.totalSegments}セグメント × 各{Math.ceil(plan.totalSteps / plan.totalSegments)}
                            ステップ
                        </div>
                    </div>
                </div>

                {/* Segments */}
                {plan.segments.map((segment, segIdx) => (
                    <div key={segIdx} className="p-3 border border-gray-200 rounded-md">
                        <div className="font-semibold mb-2">
                            {segIdx + 1}. {segment.segmentLabel}
                            {segment.rowCount && (
                                <span className="ml-2 text-gray-600 font-normal">({segment.rowCount} rows)</span>
                            )}
                        </div>
                        <div className="ml-4 space-y-2">
                            {segment.steps.map((step, stepIdx) => (
                                <div key={stepIdx} className="text-sm">
                                    <div className="flex items-start gap-2">
                                        <span className="text-gray-500">{step.stepNumber}.</span>
                                        <div className="flex-1">
                                            <div>{step.description}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                ツール: <code className="text-xs">{step.tool}</code>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Instructions */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="font-semibold text-amber-900 mb-2">⚠️ 重要な指示</div>
                    <pre className="text-xs text-amber-800 whitespace-pre-wrap font-mono">{plan.instructions}</pre>
                </div>

                {result.warnings && result.warnings.length > 0 && (
                    <div className="text-sm text-amber-600 space-y-1">
                        {result.warnings.map((warning, idx) => (
                            <div key={idx}>⚠️ {warning}</div>
                        ))}
                    </div>
                )}
            </div>
        </CollapsibleSection>
    );
}

export default StructuredMessageRenderer;

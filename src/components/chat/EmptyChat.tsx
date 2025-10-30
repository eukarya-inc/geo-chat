import { useRef, useEffect, useState, useCallback } from 'react';
import ChatInput from './ChatInput';
import ApiKeyInput from './ApiKeyInput';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { extractDataUrl, createTableFromUrl } from '../../utils/tableCreation';

interface EmptyChatProps {
    dbContext: DBContext | null;
    apiKey?: string;
    schemaName?: string | null;
    onApiKeyChange?: (value: string) => void;
    onApiKeySave?: (apiKey: string) => Promise<boolean>;
    showApiKeyInput?: boolean;
    waitForDbContext?: () => Promise<DBContext>;
    remoteFileComponent?: (onClose: () => void, onShowUrlGuide?: () => void) => React.ReactNode;
    sendMessage: (message: string) => void | Promise<void>;
}

export default function EmptyChat({
    dbContext,
    apiKey,
    schemaName,
    onApiKeyChange,
    onApiKeySave,
    showApiKeyInput,
    waitForDbContext,
    remoteFileComponent,
    sendMessage,
}: EmptyChatProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isCreatingTable, setIsCreatingTable] = useState(false);
    const [tableCreationError, setTableCreationError] = useState<string | null>(null);
    const [isWaitingForDb, setIsWaitingForDb] = useState(false);
    const [showUrlGuide, setShowUrlGuide] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        if (showUrlGuide) {
            setShowUrlGuide(false);
        }
    };

    const handleShowUrlGuide = () => {
        setShowUrlGuide(true);
        textareaRef.current?.focus();
        setTimeout(() => setShowUrlGuide(false), 5000);
    };

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            const trimmedInput = input.trim();
            if (!trimmedInput) return;

            const dataUrl = extractDataUrl(trimmedInput);

            if (dataUrl) {
                setIsCreatingTable(true);
                setTableCreationError(null);
                try {
                    let db = dbContext;
                    if (!db) {
                        if (!waitForDbContext) {
                            throw new Error('DuckDB is not initialized');
                        }
                        setIsWaitingForDb(true);
                        try {
                            db = await waitForDbContext();
                        } finally {
                            setIsWaitingForDb(false);
                        }
                    }

                    const { message } = await createTableFromUrl(dataUrl, db, schemaName || null);

                    setInput('');
                    sendMessage(message);
                } catch (error) {
                    console.error('Failed to create table from URL:', error);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    setTableCreationError(`テーブルの作成に失敗しました: ${errorMessage}`);
                } finally {
                    setIsCreatingTable(false);
                }
            } else {
                try {
                    if (!dbContext) {
                        if (!waitForDbContext) {
                            throw new Error('DuckDB is not initialized');
                        }
                        setIsWaitingForDb(true);
                        try {
                            await waitForDbContext();
                        } finally {
                            setIsWaitingForDb(false);
                        }
                    }
                    sendMessage(trimmedInput);
                    setInput('');
                } catch (error) {
                    console.error('Failed to submit message:', error);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    setTableCreationError(`メッセージの送信に失敗しました: ${errorMessage}`);
                }
            }
        },
        [input, dbContext, schemaName, sendMessage, waitForDbContext]
    );

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing && !isCreatingTable) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="flex flex-col gap-8 items-center relative">
            {showApiKeyInput && onApiKeyChange && onApiKeySave && (
                <ApiKeyInput
                    apiKey={apiKey || ''}
                    onApiKeyChange={onApiKeyChange}
                    onSave={onApiKeySave}
                    floatingMode={true}
                />
            )}
            <h1 className="text-2xl font-bold text-gray-800">今日はどんな分析をしますか？</h1>
            <div className="w-full">
                {tableCreationError && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg">
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <strong className="text-red-800 text-sm">エラー</strong>
                                <p className="text-red-700 text-sm mt-1">{tableCreationError}</p>
                            </div>
                            <button
                                onClick={() => setTableCreationError(null)}
                                className="ml-2 p-1 hover:bg-red-100 rounded transition-colors"
                                title="閉じる"
                            >
                                <svg
                                    className="w-4 h-4 text-red-800"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}
                <div className="flex-shrink-0 bg-white border border-gray-400 px-4 py-1 w-full rounded-3xl">
                    <ChatInput
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
                        onSubmit={handleSubmit}
                        onStop={() => {}}
                        dbContext={dbContext}
                        textareaRef={textareaRef}
                        placeholder="質問するか、データのURLを貼り付けてみましょう"
                        className="w-full h-full p-2.5 resize-none text-gray-800 focus:outline-none overflow-y-auto"
                        schemaName={schemaName}
                        selectedTable={null}
                        isLoading={false}
                        isCreatingTable={isCreatingTable}
                        isAnyLoading={isCreatingTable || isWaitingForDb}
                        remoteFileComponent={remoteFileComponent}
                        disabled={!apiKey}
                        isWaitingForDb={isWaitingForDb}
                        showUrlGuide={showUrlGuide}
                        onShowUrlGuide={handleShowUrlGuide}
                    />
                </div>
                <div className="flex justify-end mt-1 text-xs text-gray-500 leading-tight">
                    Enterで改行、Shift+Enterで送信
                </div>
            </div>
        </div>
    );
}

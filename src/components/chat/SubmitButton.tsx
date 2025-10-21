import { PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/outline';

interface SubmitButtonProps {
    isLoading: boolean;
    isCreatingTable: boolean;
    value: string;
    isAnyLoading: boolean;
    disabled: boolean;
    onClick: (e: React.FormEvent) => void;
    isWaitingForDb?: boolean;
}

export default function SubmitButton({
    isLoading,
    isCreatingTable,
    value,
    isAnyLoading,
    disabled,
    onClick,
    isWaitingForDb = false,
}: SubmitButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={
                (!isLoading && !value.trim()) ||
                (!isLoading && isAnyLoading) ||
                isCreatingTable ||
                isWaitingForDb ||
                disabled
            }
            className={`p-2 rounded-full transition-colors duration-200 ${
                isLoading
                    ? 'text-red-600 hover:bg-red-50'
                    : !value.trim() || isAnyLoading || isCreatingTable || isWaitingForDb || disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-blue-600 hover:bg-blue-50'
            } focus:outline-none`}
            title={
                isLoading
                    ? '停止'
                    : isWaitingForDb
                      ? 'データベース初期化中...'
                      : isCreatingTable
                        ? 'テーブル作成中...'
                        : disabled
                          ? 'APIキーを設定してください'
                          : !isLoading && isAnyLoading
                            ? '他のチャットが処理中です'
                            : '送信'
            }
        >
            {isLoading ? (
                <StopIcon className="w-5 h-5" />
            ) : isCreatingTable || isWaitingForDb ? (
                <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            ) : (
                <PaperAirplaneIcon className="w-5 h-5" />
            )}
        </button>
    );
}

interface ApiKeyInputProps {
    apiKey: string;
    onApiKeyChange: (value: string) => void;
    onSave: (apiKey: string) => Promise<boolean>;
    className?: string;
    floatingMode?: boolean;
}

export default function ApiKeyInput({
    apiKey,
    onApiKeyChange,
    onSave,
    className = '',
    floatingMode = false,
}: ApiKeyInputProps) {
    const handleSave = async () => {
        const success = await onSave(apiKey);
        if (!success && apiKey.trim()) {
            alert('APIキーの保存に失敗しました。');
        }
    };

    const containerClasses = floatingMode
        ? 'fixed top-4 left-72 bg-white rounded-lg shadow-lg border border-gray-300 p-4 z-50 min-w-96'
        : 'p-4 bg-gray-50 border-b border-gray-300 flex-shrink-0';

    return (
        <div className={`${containerClasses} ${className}`}>
            <div className="mb-2.5 text-sm font-bold">Anthropic API Key Settings</div>
            <div className="flex gap-2.5 items-center">
                <input
                    type="password"
                    value={apiKey}
                    onChange={e => onApiKeyChange(e.target.value)}
                    placeholder="Enter your Anthropic API key..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                />
                <button
                    onClick={handleSave}
                    disabled={!apiKey.trim()}
                    className={`px-4 py-2 text-white border-none rounded text-sm ${
                        apiKey.trim()
                            ? 'bg-blue-500 cursor-pointer hover:bg-blue-600'
                            : 'bg-gray-400 cursor-not-allowed'
                    }`}
                >
                    Save
                </button>
            </div>
            <div className="text-xs text-gray-600 mt-2">
                Your API key is encrypted and stored locally in your browser and never sent to our servers.
            </div>
        </div>
    );
}

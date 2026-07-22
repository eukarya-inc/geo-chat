import { useAtomValue, useSetAtom } from 'jotai';
import { RotateCcw, SendHorizontal, Settings, Square } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { MessageView } from '@/components/chat/MessageView';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAgentChat } from '@/lib/ai/useAgentChat';
import { settingsOpenAtom } from '@/store/atoms';
import { apiKeyAtom } from '@/store/settings';

const EXAMPLE_PROMPTS = [
    `${import.meta.env.BASE_URL}data/japan_cities.parquet を読み込んで地図に表示して`,
    '都道府県ごとの市区町村数をグラフにして',
    `Load ${import.meta.env.BASE_URL}data/japan_cities.parquet and show it on the map`,
];

export function ChatPanel() {
    const apiKey = useAtomValue(apiKeyAtom);
    const openSettings = useSetAtom(settingsOpenAtom);
    const { messages, status, sendMessage, stop, reset } = useAgentChat();
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the bottom as messages stream in.
    useEffect(() => {
        const el = scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || status === 'streaming') return;
        void sendMessage(text);
        setInput('');
    };

    // Send on Enter, newline on Shift+Enter.
    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit(e);
        }
    };

    if (!apiKey) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <p className="text-muted-foreground text-sm">Set your API key in Settings to start chatting.</p>
                <Button onClick={() => openSettings(true)}>
                    <Settings />
                    Open Settings
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-muted-foreground text-xs font-medium">Chat</span>
                <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
                    <RotateCcw />
                    New chat
                </Button>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                    {messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                            <p className="text-muted-foreground text-sm">Ask questions about your geospatial data.</p>
                            <div className="flex flex-col gap-2">
                                {EXAMPLE_PROMPTS.map(prompt => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={() => setInput(prompt)}
                                        className="bg-muted hover:bg-muted/70 text-muted-foreground rounded-md border px-3 py-1.5 text-left text-xs"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 p-4">
                            {messages.map(message => (
                                <MessageView key={message.id} message={message} />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>
            <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
                <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Type a message…"
                    className="max-h-40 min-h-10 flex-1 resize-none"
                    rows={1}
                />
                {status === 'streaming' ? (
                    <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={stop}>
                        <Square />
                    </Button>
                ) : (
                    <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
                        <SendHorizontal />
                    </Button>
                )}
            </form>
        </div>
    );
}

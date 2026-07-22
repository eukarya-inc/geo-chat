import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

export function ChatPanel() {
    const [messages, setMessages] = useState<string[]>([]);
    const [input, setInput] = useState('');

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;
        setMessages(prev => [...prev, text]);
        setInput('');
    };

    // Send on Enter, newline on Shift+Enter.
    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit(e);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <ScrollArea className="min-h-0 flex-1">
                {messages.length === 0 ? (
                    <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
                        Ask questions about your geospatial data…
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 p-4">
                        {messages.map((message, i) => (
                            <div key={i} className="flex justify-end">
                                <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
                                    {message}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
            <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
                <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Type a message…"
                    className="max-h-40 min-h-10 flex-1 resize-none"
                    rows={1}
                />
                <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
                    <SendHorizontal />
                </Button>
            </form>
        </div>
    );
}

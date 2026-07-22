import { AlertTriangle, Check, Loader2, Wrench, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ChatMessage, MessagePart } from '@/lib/ai/types';

/** Renders one chat message: a user bubble or an assistant's sequence of parts. */
export function MessageView({ message }: { message: ChatMessage }) {
    if (message.role === 'user') {
        const text = message.parts.map(p => (p.type === 'text' ? p.text : '')).join('');
        return (
            <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
                    {text}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {message.parts.map((part, i) => (
                <PartView key={i} part={part} />
            ))}
        </div>
    );
}

function PartView({ part }: { part: MessagePart }) {
    if (part.type === 'text') {
        return (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm break-words">
                <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
            </div>
        );
    }
    if (part.type === 'error') {
        return (
            <div className="text-destructive flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{part.message}</span>
            </div>
        );
    }
    return <ToolCard part={part} />;
}

const STATUS_ICON = {
    running: <Loader2 className="size-3.5 animate-spin" />,
    done: <Check className="size-3.5 text-emerald-600" />,
    error: <X className="text-destructive size-3.5" />,
};

/** Pulls the fetched skill ids out of a get_skill call's input for the badge summary. */
function fetchedSkillIds(part: Extract<MessagePart, { type: 'tool' }>): string[] {
    const fromOutput = (part.output as { fetched?: unknown } | undefined)?.fetched;
    if (Array.isArray(fromOutput)) return fromOutput.map(String);
    const fromInput = (part.input as { skills?: unknown } | undefined)?.skills;
    if (Array.isArray(fromInput)) return fromInput.map(String);
    return [];
}

/** Compact, collapsible card for a single tool call with its input and output. */
function ToolCard({ part }: { part: Extract<MessagePart, { type: 'tool' }> }) {
    const skillBadges = part.name === 'get_skill' ? fetchedSkillIds(part) : [];
    return (
        <details className="bg-muted/40 rounded-md border text-xs">
            <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 select-none">
                <Wrench className="text-muted-foreground size-3.5" />
                <span className="font-mono font-medium">{part.name}</span>
                {skillBadges.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                        {skillBadges.map(id => (
                            <span
                                key={id}
                                className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[10px]"
                            >
                                {id}
                            </span>
                        ))}
                    </span>
                )}
                <span className="ml-auto">{STATUS_ICON[part.state]}</span>
            </summary>
            <div className="flex flex-col gap-2 border-t px-2 py-2">
                <JsonBlock label="input" value={part.input} />
                {part.output !== undefined && <JsonBlock label="output" value={part.output} />}
            </div>
        </details>
    );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground uppercase">{label}</span>
            <pre className="bg-background max-h-48 overflow-auto rounded border p-2 font-mono text-[11px] whitespace-pre-wrap">
                {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            </pre>
        </div>
    );
}

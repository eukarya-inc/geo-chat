import { BarChart3, Map, Table2, Terminal, type LucideIcon } from 'lucide-react';

function Placeholder({ icon: Icon, phase }: { icon: LucideIcon; phase: string }) {
    return (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <Icon className="size-10 opacity-40" />
            <p className="text-sm">coming in {phase}</p>
        </div>
    );
}

export function TablePlaceholder() {
    return <Placeholder icon={Table2} phase="Phase 3" />;
}

export function ChartPlaceholder() {
    return <Placeholder icon={BarChart3} phase="Phase 3" />;
}

export function MapPlaceholder() {
    return <Placeholder icon={Map} phase="Phase 3" />;
}

export function SqlPlaceholder() {
    return <Placeholder icon={Terminal} phase="Phase 2/3" />;
}

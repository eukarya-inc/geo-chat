import { useAtom } from 'jotai';
import { AlertTriangle } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { settingsOpenAtom } from '@/store/atoms';
import { apiKeyAtom, modelAtom, MODEL_OPTIONS } from '@/store/settings';

/** Dialog for entering the Anthropic API key and choosing the Claude model. */
export function SettingsDialog() {
    const [open, setOpen] = useAtom(settingsOpenAtom);
    const [apiKey, setApiKey] = useAtom(apiKeyAtom);
    const [model, setModel] = useAtom(modelAtom);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>Configure the Anthropic API access used by the chat.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    <Label htmlFor="api-key">Anthropic API key</Label>
                    <Input
                        id="api-key"
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-ant-…"
                        autoComplete="off"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <Label htmlFor="model">Model</Label>
                    <Select value={model} onValueChange={setModel}>
                        <SelectTrigger id="model" className="w-full">
                            <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                            {MODEL_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="text-muted-foreground flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p>
                        The key is stored unencrypted in this browser&apos;s localStorage and sent directly to the
                        Anthropic API from your browser. Use a personal key and remove it after the workshop.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

import { atomWithStorage } from 'jotai/utils';

/** The model IDs offered in the Settings dialog. */
export const MODEL_OPTIONS = [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
] as const;

export const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Anthropic API key, persisted in PLAIN localStorage. This is a workshop app
 * with no backend: the key is stored unencrypted and sent straight from the
 * browser to the Anthropic API. Participants use a personal key and delete it
 * afterwards (the Settings dialog states this).
 */
export const apiKeyAtom = atomWithStorage<string>(
    'geo-chat:apiKey',
    // Workshops can ship a key via `.env` (VITE_ANTHROPIC_API_KEY=...) instead
    // of having every participant paste it into the Settings dialog.
    (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ?? '',
    undefined,
    { getOnInit: true }
);

/** Selected Claude model, persisted in localStorage. */
export const modelAtom = atomWithStorage<string>('geo-chat:model', DEFAULT_MODEL, undefined, { getOnInit: true });

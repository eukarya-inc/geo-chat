/**
 * Prerequisite gate — a per-session record of which skill *domains* have been
 * fetched via `get_skill` this session. Action tools that need documentation
 * (map styling, chart specs) check this before running, so the model is nudged to
 * read the relevant skill first instead of guessing the format.
 *
 * Deliberately a tiny module-level Set: it is taught in the workshop as "the whole
 * gate is these few lines". Reset it whenever the chat session resets.
 */
const fetchedDomains = new Set<string>();

/** Record that a skill domain (e.g. `map`, `vega`) has been fetched this session. */
export function markFetched(domain: string): void {
    fetchedDomains.add(domain);
}

/** Has any skill of this domain been fetched this session? */
export function hasFetched(domain: string): boolean {
    return fetchedDomains.has(domain);
}

/** Forget everything — call when the chat session resets. */
export function resetGate(): void {
    fetchedDomains.clear();
}

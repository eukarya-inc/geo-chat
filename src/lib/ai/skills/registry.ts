/**
 * Skill registry — the heart of the workshop's "extend the agent with one markdown
 * file" story. Every `*.md` under this folder is a skill: build-time-loaded raw text
 * with a tiny YAML-ish frontmatter (`description`, `tasks`, optional `deps`) followed
 * by a markdown body of instructions. The `get_skill` tool serves those bodies to the
 * model on demand, and the catalog (built here) tells the model what exists.
 *
 * To add a skill, drop a new `<domain>/<name>.md` here — no code changes needed.
 */

/** One parsed skill file. */
export interface Skill {
    /** Path-derived id, e.g. `duckdb.spatial`. */
    id: string;
    /** Id prefix before the first dot, e.g. `duckdb`. Also the gate "domain". */
    domain: string;
    /** One-line catalog description from frontmatter. */
    description: string;
    /** Routing keywords (English + Japanese) from frontmatter. */
    tasks: string[];
    /** Skill ids that must be fetched alongside this one. */
    deps: string[];
    /** The markdown instructions (frontmatter stripped). */
    body: string;
}

// Vite (and vitest, which runs through Vite) eagerly inlines every matching file as a
// raw string at build time. The keys are the relative paths, e.g. './duckdb/spatial.md'.
const rawFiles = import.meta.glob('./**/*.md', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/** Reads a single `key: value` line out of the frontmatter block. */
function frontmatterField(front: string, key: string): string {
    const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front);
    return m ? m[1].trim() : '';
}

/** Splits a comma-separated frontmatter value into trimmed, non-empty items. */
function splitList(value: string): string[] {
    return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

/** Parses one raw markdown file into its frontmatter fields and body. */
export function parseFrontmatter(raw: string): {
    description: string;
    tasks: string[];
    deps: string[];
    body: string;
} {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) return { description: '', tasks: [], deps: [], body: raw.trim() };
    const [, front, body] = match;
    return {
        description: frontmatterField(front, 'description'),
        tasks: splitList(frontmatterField(front, 'tasks')),
        deps: splitList(frontmatterField(front, 'deps')),
        body: body.trim(),
    };
}

/** `./duckdb/spatial.md` → `duckdb.spatial`. */
export function idFromPath(path: string): string {
    return path.replace(/^\.\//, '').replace(/\.md$/, '').replace(/\//g, '.');
}

/** `duckdb.spatial` → `duckdb` (the first path segment / gate domain). */
export function domainOf(id: string): string {
    const dot = id.indexOf('.');
    return dot === -1 ? id : id.slice(0, dot);
}

/** Builds the skill list from a raw path→text map (injectable for tests). */
export function buildSkills(files: Record<string, string>): Skill[] {
    return Object.entries(files)
        .map(([path, raw]) => {
            const id = idFromPath(path);
            const { description, tasks, deps, body } = parseFrontmatter(raw);
            return { id, domain: domainOf(id), description, tasks, deps, body };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}

const skills = buildSkills(rawFiles);
const byId = new Map(skills.map(s => [s.id, s]));

export function getAllSkills(): Skill[] {
    return skills;
}

export function getSkill(id: string): Skill | undefined {
    return byId.get(id);
}

/**
 * Expands a list of requested ids to include their `deps`, dependencies first,
 * deduplicated, preserving request order. Unknown ids are kept in place so the
 * caller can report them as not-found.
 */
export function resolveWithDeps(ids: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (id: string) => {
        if (seen.has(id)) return;
        const skill = byId.get(id);
        if (skill) for (const dep of skill.deps) add(dep); // deps before dependent
        if (seen.has(id)) return; // a cyclic dep may have already added us
        seen.add(id);
        out.push(id);
    };
    for (const id of ids) add(id);
    return out;
}

/** Compact catalog embedded in the get_skill tool description: one line per skill. */
export function buildCatalog(): string {
    return getAllSkills()
        .map(s => {
            const tasks = s.tasks.length ? ` [${s.tasks.join(', ')}]` : '';
            return `- ${s.id} — ${s.description}${tasks}`;
        })
        .join('\n');
}

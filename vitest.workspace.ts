import { fileURLToPath, URL } from 'node:url';
import { loadEnv } from 'vite';
import { defineWorkspace } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

// The evals project (src/evals/*.eval.browser.test.ts) drives the real agent loop
// against the real Anthropic API, so it needs a real key. The key lives in the
// gitignored `.env` at the repo root as ANTHROPIC_API_KEY. Vite only auto-exposes
// VITE_-prefixed vars to browser code, so we load the whole .env here (empty prefix =
// all keys) in Node and inject just what the evals project needs via `define`.
// process.env wins so `VITE_EVAL_RUNS=1 npm run test:evals` overrides on the CLI.
// The key is NEVER logged; it is only baked into the evals bundle, which runs locally
// and never in CI (evals cost real money — see the test:evals script). Other projects
// don't get the define, so the key isn't embedded anywhere but the evals bundle.
const fileEnv = loadEnv('test', process.cwd(), '');
const pick = (key: string): string => process.env[key] ?? fileEnv[key] ?? '';
const evalDefine = {
    'import.meta.env.VITE_ANTHROPIC_API_KEY': JSON.stringify(
        pick('VITE_ANTHROPIC_API_KEY') || pick('ANTHROPIC_API_KEY')
    ),
    'import.meta.env.VITE_EVAL_MODEL': JSON.stringify(pick('VITE_EVAL_MODEL')),
    'import.meta.env.VITE_EVAL_RUNS': JSON.stringify(pick('VITE_EVAL_RUNS')),
    'import.meta.env.VITE_EVAL_THRESHOLD': JSON.stringify(pick('VITE_EVAL_THRESHOLD')),
};

const commonExclude = ['node_modules', 'dist', 'tmp', '.idea', '.git', '.cache'];

const webkitBrowser = {
    enabled: true,
    name: 'webkit',
    provider: 'playwright',
    headless: true,
    screenshotFailures: false,
} as const;

export default defineWorkspace([
    {
        resolve: { alias },
        test: {
            name: 'unit',
            globals: true,
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts', 'vitest-localstorage-mock'],
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: [...commonExclude, 'src/**/*.browser.test.{ts,tsx}'],
        },
    },
    {
        resolve: { alias },
        test: {
            name: 'browser',
            globals: true,
            browser: webkitBrowser,
            include: ['src/**/*.browser.test.{ts,tsx}'],
            // Keep the evals out of the regular browser run — they cost real money and
            // need a key. They live in their own `evals` project below.
            exclude: [...commonExclude, 'src/**/*.eval.browser.test.{ts,tsx}'],
        },
    },
    {
        resolve: { alias },
        // Only the evals project embeds the API key (via define); nothing else does.
        define: evalDefine,
        test: {
            name: 'evals',
            globals: true,
            browser: webkitBrowser,
            include: ['src/**/*.eval.browser.test.{ts,tsx}'],
            exclude: commonExclude,
            // One eval run makes several paid API round-trips; give it room and no retries.
            testTimeout: 300_000,
            hookTimeout: 60_000,
            retry: 0,
        },
    },
]);

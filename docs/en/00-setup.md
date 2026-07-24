# 00. Setup

Before starting the workshop, we get geo-chat running locally, enter an Anthropic API key, and
confirm that the first demo works with the sample data. Once you get through here, you are ready.

This takes 10–15 minutes. If something goes wrong, see
[appendix-troubleshooting.md](./appendix-troubleshooting.md).

## 1. What you need

- **Node.js 20 or newer** (check with `node -v`; if it is older than 20, update via [nodejs.org](https://nodejs.org)
  or a tool like `nvm` / `volta`)
- **A modern browser**: the latest Chrome / Edge / Firefox.
  geo-chat uses **WebAssembly and Web Workers**, so it does not run in old browsers
  or some embedded environments (DuckDB-WASM is covered in chapter 2).
- **An Anthropic API key** (you will get one in the next step)

## 2. Clone and run

```bash
git clone <URL of this repository>
cd geo-chat
npm install       # install dependencies (DuckDB-WASM and maplibre-gl are on the large side)
npm run dev       # start the dev server (vite)
```

Running `npm run dev` prints a local URL (by default `http://localhost:5173/geo-chat/`).
Open it in a browser and you get a screen with a chat panel on the left and four tabs —
**Table / Chart / Map / SQL** — on the right.

> **Note**: The URL path has `/geo-chat/` in it because `vite.config.ts` sets `base: '/geo-chat/'`
> for GitHub Pages hosting. The sample-data URLs carry this prefix too (more below).

On the first run, DuckDB-WASM is initialized inside the browser. When the SQL tab shows
"Initializing DuckDB…", wait a few seconds and you will be able to run `SELECT 1 AS hello;`.

## 3. Get an Anthropic API key

To run the chat (the AI agent), you need your own Anthropic API key.
geo-chat has no backend and **calls the Anthropic API directly from the browser**
(we take this mechanism apart in chapter 2).

1. Create an account / log in at [console.anthropic.com](https://console.anthropic.com).
2. Under **Billing**, add a small amount of **prepaid credit** (say $5).
   For one workshop, $1–2 is plenty.
   With a zero credit balance, even a correct key gives a `400 / credit balance` error.
3. Under **API Keys**, create a new key and copy the string that starts with `sk-ant-…`.
   The key is shown in full only at creation time, so copy it right then.

> **On the day**: In some sessions the organizer hands out a key. In that case, use the key you were given.
> Either way, the app is built so that each person enters the key in their own browser.

## 4. Enter the key in Settings

1. Open **Settings** at the top right of the screen (or in the center when the chat is not yet configured).
2. Paste `sk-ant-…` into **Anthropic API key**.
3. You can leave **Model** at the default **Claude Sonnet 4.5**
   (you can also switch to Opus / Haiku; defined in `MODEL_OPTIONS` in `src/store/settings.ts`).

> **⚠️ A note on localStorage**: The key you enter is stored in this browser's **localStorage in plain text
> (not encrypted)** and is sent from the browser straight to the Anthropic API. This is a trade-off that only
> makes sense because this is a backend-less workshop app. **Use a personal key and delete it after the
> workshop** (clear it in Settings, or clear the browser's localStorage).
> The same warning appears in the Settings dialog (`src/components/settings/SettingsDialog.tsx`).

## 5. About the built-in data

This repository ships the following samples in `public/data/`:

| File                        | Contents                                          | Geometry                        |
| --------------------------- | ------------------------------------------------- | ------------------------------- |
| `japan_cities.parquet`      | Japanese municipalities (GeoParquet)              | MultiPolygon (GEOMETRY on load) |
| `japan_prefectures.parquet` | Japanese prefectures (GeoParquet)                 | MultiPolygon (GEOMETRY on load) |
| `customer.parquet`          | A non-spatial attribute table (for join practice) | none                            |
| `test.geojson`              | A small GeoJSON for a quick sanity check          | yes                             |

> Because the spatial extension recognizes the geo metadata of a GeoParquet, once loaded the `geom` column
> is **already `GEOMETRY` type from the start** (no conversion needed — it goes straight onto the map).

Of these, `japan_cities` and `japan_prefectures` are taught to the agent as **built-in datasets**. Their entries
live in the built-in dataset registry (`src/lib/ai/builtinDatasets.ts`), whose contents are passed to the model
through the system prompt. So **just asking "show the Japanese municipalities on the map" is enough — the agent
loads this data itself**; you don't need to type a URL by hand. Adding one entry to the registry teaches the agent
a new dataset (this "carry knowledge in the ② layer" idea is the same as the skills in chapter 3).

**When you want to load your own data**, enter a URL and a table name in the SQL tab's "Import from URL" and Import
(used in the chapter 2 exercise and the chapter 5 challenges). To read a bundled sample by hand, the URL is
`/geo-chat/data/japan_cities.parquet` (`import.meta.env.BASE_URL` + `data/…`).

## 6. Verify with a demo prompt

When the chat is empty, three **sample prompt chips** appear above the input box
(`EXAMPLE_PROMPTS` in `src/components/chat/ChatPanel.tsx`). We use these first to check that things work.
The first two chips are in Japanese and the third in English; the app handles both languages (see the note below).

```
日本の自治体を地図に表示して
```

Clicking this chip puts the sentence into the input box; send it. When it works:

1. Tool cards (`duckdb_query` and others) appear one after another in the chat (click to expand input/output).
   The agent loads the built-in dataset `japan_cities` **by itself**.
2. The Map tab opens automatically and Japan's municipalities are drawn on the map.

If this works, you are ready. You can go on to try the remaining chips too:

```
都道府県ごとの市区町村数をグラフにして
Show the Japanese municipalities on the map
```

> **About language**: The sample chips mix Japanese and English, but the agent's system prompt has a rule to
> "reply in the language the user wrote in" (`src/lib/ai/systemPrompt.ts`). If you type in English —
> "color the municipalities by prefecture and show them on the map" (Japanese: 「自治体を都道府県ごとに色分けして地図に表示して」) —
> it replies in that language.

## 7. When it does not work

- **Chat stays at "Set your API key in Settings…"** → the key is not entered in Settings.
- **`401` / `unauthorized`** → wrong key. Re-check Settings.
- **`credit balance is too low`** → add credit in the console (step 3-2).
- **Nothing shows on the map / URL loading fails with CORS** → see
  [appendix-troubleshooting.md](./appendix-troubleshooting.md), which includes a CORS explanation.
- **DuckDB does not initialize / blank screen** → check you're on a supported browser (latest Chrome / Edge / Firefox).
  If it still won't clear, see "The app doesn't boot" in the appendix.

When you are ready, go on to [01. A bare model](./01-bare-model.md).

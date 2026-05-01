# opencode-harper

An OpenCode plugin that silently spell-checks user prompts using [Harper](https://github.com/Automattic/harper) before they reach the LLM. The model never knows spell checking happened — it just sees clean text.

## Installation

Add the plugin path to your `opencode.json`:

```json
{
  "plugin": ["/path/to/opencode-harper/index.ts"]
}
```

Or place `index.ts` directly in your global plugins directory (`~/.config/opencode/plugins/`) or project plugins directory (`.opencode/plugins/`).

**Important**: OpenCode only loads files directly in the plugins directory, not in subdirectories. If you place the plugin in a subdirectory like `opencode-harper/`, you must reference it via a file:// URL in your config:

```json
{
  "plugin": ["file:///home/user/.config/opencode/plugins/opencode-harper/index.ts"]
}
```

## How it works

1. Intercepts user prompts via `chat.message` hook (when a new user message is created, before it's saved)
2. Skips messages from non-primary agents — only processes messages where `input.agent` is `"build"` or `"plan"`. Subagent messages (`"explore"`, `"general"`, etc.) and internal agents (`"compaction"`, `"title"`, `"summary"`) are ignored.
3. Filters to **original user text only** — skips parts marked `synthetic` (system-injected content like file reads, tool output summaries) and `ignored` parts
4. Runs `harper-cli lint --format json` on each user text part via `Bun.spawn()`
5. Applies all Harper corrections (spelling, grammar, style, typos)
6. Shows a toast notification with changes made
7. Model output is **not** spell-checked

## Protected regions

Corrections are **skipped** inside:

- **Fenced code blocks** (` ```...``` `)
- **Inline code** (`` `...` ``)
- **Double-quoted strings** (`"..."`, including smart quotes)
- **Single-quoted strings** (`'...'`, including smart quotes) — contractions like `it's`, `don't` are preserved via lookbehind/lookahead regex
- **File paths** (absolute `/home/user/...`, home-relative `~/...`, relative `./...` and `../...`)

The regex ensures that single quotes between word characters (contractions, possessives) are NOT treated as quoted regions.

## Implementation notes

- Uses `Bun.spawn()` instead of the `$` shell API because `.stdin()` on `$` may not work reliably in the plugin context
- Logs initialization and errors via `client.app.log()` for debugging
- Gracefully handles `harper-cli` failures by catching exceptions and logging them
- Sorts lints in reverse `char_start` order before applying to preserve character offsets

## Debugging

If the plugin isn't working:

1. Check if it's loaded: You should see `"Plugin initialized"` in the OpenCode logs when it starts
2. Check opencode logs for errors: Look for `opencode-harper` errors
3. Verify `harper-cli` is installed and on your `PATH`: `harper-cli lint --help`
4. Verify plugin registration: Check your `opencode.json` contains the correct plugin path

## Testing

Run the test suite:

```bash
bun test.ts
```

This verifies protected region detection, suggestion parsing, and integration with `harper-cli`.

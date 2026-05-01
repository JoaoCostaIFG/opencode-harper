# opencode-harper

An [OpenCode](https://opencode.ai) plugin that silently spell-checks your prompts using [Harper](https://github.com/Automattic/harper) before they reach the LLM. The model never knows spell checking happened; it just the fixed text.

The spell checking is quite aggressive. It can often make mistakes, but I haven't seen any way to make the decisions dynamic/user triggered.

## Installation

Add the plugin path to your `opencode.json`:

```json
{
  "plugin": ["/path/to/opencode-harper/index.ts"]
}
```

Or place `index.ts` directly in your global plugins directory (`~/.config/opencode/plugins/`) or project plugins directory (`.opencode/plugins/`).

## How it works

1. Intercepts user prompts via `chat.message` hook (when a new user message is created, before it's saved)
2. Skips messages from non-primary agents - only processes messages where `input.agent` is `"build"` or `"plan"`. Subagent messages (`"explore"`, `"general"`, etc.) and internal agents (`"compaction"`, `"title"`, `"summary"`) are ignored.
3. Filters to **original user text only** - skips parts marked `synthetic` (system-injected content like file reads, tool output summaries) and `ignored` parts
4. Runs `harper-cli lint --format json` on each user text part via `Bun.spawn()`
5. Applies all Harper corrections (spelling, grammar, style, typos)
6. Shows a toast notification with changes made

**Note:** Only user's chat input is spell checked: model output is untouched.

## Protected regions

Corrections are **skipped** inside:

- **Fenced code blocks** (` ```...``` `)
- **Inline code** (`` `...` ``)
- **Double-quoted strings** (`"..."`, including smart quotes)
- **Single-quoted strings** (`'...'`, including smart quotes) — contractions like `it's`, `don't` are preserved via lookbehind/lookahead regex
- **File paths** (absolute `/home/user/...`, home-relative `~/...`, relative `./...` and `../...`)
- **Filenames** with common extensions (`*.ts`, `*.py`, `*.json`, etc.)

## Requirements

- [OpenCode](https://opencode.ai)
- [Harper CLI](https://github.com/Automattic/harper) installed and available in `PATH`

## Testing

```bash
bun test.ts
```

## License

MIT

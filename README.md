# opencode-harper

An [OpenCode](https://opencode.ai) plugin that spell-checks your prompts using [Harper's cli](https://github.com/Automattic/harper) and applies the suggestions before they reach the LLM. The model doesn't know about the spell checking: it just seems the corrected/fixed prompt.

## How it works

1. Intercepts user prompts via the `experimental.chat.messages.transform` hook (before they're sent to the model)
2. Runs `harper-cli lint --format json` on the prompt text
3. Applies all Harper corrections (spelling, grammar, style, typos)
4. Shows a toast notification listing what was fixed

**Note:** model output is **not** spell-checked.

### Protected regions

Corrections are **skipped** inside:

- **Fenced code blocks** (` ```...``` `)
- **Inline code** (`` `...` ``)
- **Double-quoted strings** (`"..."`, including smart quotes)
- **Single-quoted strings** (`'...'`, including smart quotes)
  - Contractions like `it's`, `don't` are preserved

## Requirements

- [OpenCode](https://opencode.ai) (duh)
- [Harper cli](https://github.com/Automattic/harper) installed and available in `PATH`

## Install

Add the plugin path to your `opencode.json`:

```json
{
  "plugin": ["/path/to/opencode-harper/index.ts"]
}
```

Or place `index.ts` directly in your global plugins directory (`~/.config/opencode/plugins/`) or project plugins directory (`.opencode/plugins/`).

**TODO:** publish the plugin on npm.

## Test

```bash
bun test.ts
```

## License

MIT

interface Lint {
  rule: string
  kind: string
  span: { char_start: number; char_end: number }
  suggestions: string[]
  matched_text: string
}

interface HarperFile {
  lints: Lint[]
}

interface Region {
  start: number
  end: number
}

export function findProtectedRegions(text: string): Region[] {
  const regions: Region[] = []
  const overlapsExisting = (s: number, e: number) =>
    regions.some((r) => s < r.end && e > r.start)

  let m: RegExpExecArray | null

  const fencedRe = /```[\s\S]*?```/g
  while ((m = fencedRe.exec(text)) !== null) {
    regions.push({ start: m.index, end: m.index + m[0].length })
  }

  const inlineRe = /`[^`\n]+`/g
  while ((m = inlineRe.exec(text)) !== null) {
    const s = m.index
    const e = s + m[0].length
    if (!overlapsExisting(s, e)) regions.push({ start: s, end: e })
  }

  const dqRe = /["\u201C][^"\u201C\u201D]*?["\u201D]/g
  while ((m = dqRe.exec(text)) !== null) {
    const s = m.index
    const e = s + m[0].length
    if (!overlapsExisting(s, e)) regions.push({ start: s, end: e })
  }

  const sqRe = /(?<![a-zA-Z])['\u2018][^'\u2018\u2019\n]*?['\u2019](?![a-zA-Z])/g
  while ((m = sqRe.exec(text)) !== null) {
    const s = m.index
    const e = s + m[0].length
    if (!overlapsExisting(s, e)) regions.push({ start: s, end: e })
  }

  return regions
}

export function overlaps(start: number, end: number, regions: Region[]): boolean {
  return regions.some((r) => start < r.end && end > r.start)
}

export function parseSuggestion(s: string): string {
  return s
    .replace(/^Replace with:\s*/, "")
    .replace(/^[\u201C"\u201D]+|[\u201C"\u201D]+$/g, "")
}

export function applyFixes(
  text: string,
  lints: Lint[],
  regions: Region[],
): { text: string; changes: string[] } {
  const filtered = lints.filter(
    (l) =>
      l.suggestions.length > 0 &&
      !overlaps(l.span.char_start, l.span.char_end, regions),
  )

  const sorted = [...filtered].sort(
    (a, b) => b.span.char_start - a.span.char_start,
  )

  let result = text
  const changes: string[] = []

  for (const lint of sorted) {
    const replacement = parseSuggestion(lint.suggestions[0])
    const original = result.substring(
      lint.span.char_start,
      lint.span.char_end,
    )
    result =
      result.substring(0, lint.span.char_start) +
      replacement +
      result.substring(lint.span.char_end)
    changes.push(`${original} \u2192 ${replacement}`)
  }

  return { text: result, changes }
}

async function lintWithHarper(text: string): Promise<Lint[]> {
  const proc = Bun.spawn(["harper-cli", "lint", "--format", "json"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  proc.stdin.write(text)
  proc.stdin.end()
  const stdout = await new Response(proc.stdout).text()
  await proc.exited
  const result = JSON.parse(stdout) as HarperFile[]
  return result?.[0]?.lints ?? []
}

export const HarperSpellCheck = async ({ client }: any) => {
  await client.app.log({
    body: {
      service: "opencode-harper",
      level: "info",
      message: "Plugin initialized",
    },
  })

  return {
    "experimental.chat.messages.transform": async (_input: any, output: any) => {
      const msgs = output?.messages
      if (!Array.isArray(msgs)) return

      for (const msg of msgs) {
        if (msg?.info?.role !== "user") continue
        const parts = msg?.parts
        if (!Array.isArray(parts)) continue

        for (const part of parts) {
          if (part.type !== "text" || part.ignored) continue
          if (!part.text || typeof part.text !== "string") continue
          if (part.text.trim().length === 0) continue

          try {
            const lints = await lintWithHarper(part.text)
            if (!lints.length) continue

            const regions = findProtectedRegions(part.text)
            const { text: corrected, changes } = applyFixes(
              part.text,
              lints,
              regions,
            )

            if (changes.length > 0) {
              part.text = corrected
              const summary =
                changes.length <= 5
                  ? changes.join(", ")
                  : changes.slice(0, 5).join(", ") +
                    ` and ${changes.length - 5} more`
              await client.tui.showToast({
                body: {
                  message: `Harper fixed ${changes.length}: ${summary}`,
                  variant: "info",
                },
              })
            }
          } catch (e: any) {
            await client.app.log({
              body: {
                service: "opencode-harper",
                level: "error",
                message: `Harper error: ${e?.message ?? e}`,
              },
            })
          }
        }
      }
    },
  }
}

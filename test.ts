import { findProtectedRegions, applyFixes, parseSuggestion } from "./index"

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

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  PASS: ${msg}`)
  } else {
    failed++
    console.error(`  FAIL: ${msg}`)
  }
}

async function runHarper(text: string): Promise<Lint[]> {
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

console.log("\n=== Protected Regions ===")

{
  const regions = findProtectedRegions("hello `code here` world")
  assert(regions.length === 1, "inline code detected")
  assert(
    regions[0].start === 6 && regions[0].end === 17,
    `inline code bounds correct (got ${regions[0]?.start}-${regions[0]?.end})`,
  )
}

{
  const regions = findProtectedRegions("hello ```\ncode here\n``` world")
  assert(regions.length === 1, "fenced code block detected")
  assert(regions[0].start === 6, "fenced code block start correct")
}

{
  const regions = findProtectedRegions(
    'hello `code` and ```\nblock\n``` and `"nested"`',
  )
  assert(
    regions.length === 3,
    `multiple regions: got ${regions.length}, expected 3`,
  )
}

{
  const regions = findProtectedRegions('she said "hello world" to me')
  assert(regions.length === 1, "double quotes detected")
  assert(regions[0].start === 9, "double quote start correct")
}

{
  const regions = findProtectedRegions("it's a beautiful day and don't worry")
  assert(
    regions.length === 0,
    `contractions NOT treated as quoted regions (got ${regions.length})`,
  )
}

{
  const regions = findProtectedRegions("she said 'hello world' to me")
  assert(regions.length === 1, "single quotes with space inside detected")
}

{
  const regions = findProtectedRegions("press 'enter' to continue")
  assert(
    regions.length === 1,
    `single-quoted word detected (got ${regions.length})`,
  )
}

{
  const regions = findProtectedRegions("check /home/joao/Desktop/opencode for me")
  assert(regions.length === 1, `absolute path detected (got ${regions.length})`)
  const r = regions.find((r) => r.start === 6)
  assert(!!r, "absolute path start correct")
  const matched = "check /home/joao/Desktop/opencode for me".substring(r!.start, r!.end)
  assert(matched === "/home/joao/Desktop/opencode", `matched '${matched}'`)
}

{
  const regions = findProtectedRegions("look at ~/projects/my-app/src")
  assert(regions.length === 1, `home-relative path detected (got ${regions.length})`)
}

{
  const regions = findProtectedRegions("run ./scripts/build.sh and ../config.toml")
  assert(regions.length === 2, `relative paths detected (got ${regions.length})`)
}

{
  const regions = findProtectedRegions("see src/index.ts and /tmp/output")
  assert(
    regions.some((r) => r.start === 21),
    "absolute path /tmp/output detected",
  )
}

{
  const regions = findProtectedRegions("it's a test with somee typos don't worry")
  assert(regions.length === 0, `no false path matches in normal text (got ${regions.length})`)
}

{
  const regions = findProtectedRegions("check AGENTS.md for more info")
  assert(regions.length === 1, `bare filename AGENTS.md detected (got ${regions.length})`)
  const r = regions[0]
  const matched = "check AGENTS.md for more info".substring(r!.start, r!.end)
  assert(matched === "AGENTS.md", `matched '${matched}'`)
}

{
  const regions = findProtectedRegions("see README.md and package.json")
  assert(regions.length === 2, `multiple bare filenames detected (got ${regions.length})`)
}

{
  const regions = findProtectedRegions("the file src/index.ts at ./src/index.ts")
  assert(
    regions.length === 2,
    `bare filename and path both detected (got ${regions.length})`,
  )
  const bare = regions.find((r) => {
    const text = "the file src/index.ts at ./src/index.ts"
    return text.substring(r.start, r.end) === "src/index.ts"
  })
  assert(!!bare, "bare filename src/index.ts found even with path prefix")
}

{
  const regions = findProtectedRegions("there are noo files here")
  assert(regions.length === 0, `no false filename matches in normal text (got ${regions.length})`)
}

console.log("\n=== parseSuggestion ===")

{
  assert(parseSuggestion("Replace with: \u201Ctips\u201D") === "tips", "smart quotes stripped")
  assert(parseSuggestion('Replace with: "tips"') === "tips", "straight quotes stripped")
  assert(parseSuggestion("Replace with: \u201Ca\u201D") === "a", "single char suggestion")
}

console.log("\n=== Harper CLI + applyFixes ===")

{
  const text = "This an test with somee typos"
  const lints = await runHarper(text)
  assert(lints.length > 0, `harper found ${lints.length} lints in test text`)
  const regions = findProtectedRegions(text)
  const { text: fixed, changes } = applyFixes(text, lints, regions)
  assert(fixed !== text, "text was modified")
  assert(changes.length > 0, `applied ${changes.length} changes`)
  console.log(`  Original: ${text}`)
  console.log(`  Fixed:    ${fixed}`)
  console.log(`  Changes:  ${changes.join(", ")}`)
}

{
  const text = "somee typos in `codee blok` here"
  const lints = await runHarper(text)
  const regions = findProtectedRegions(text)
  const { changes } = applyFixes(text, lints, regions)
  assert(
    !changes.some((c) => c.includes("codee") || c.includes("blok")),
    "lints inside inline code are skipped",
  )
}

{
  const text = "it's a test with somee typos don't worry"
  const lints = await runHarper(text)
  const regions = findProtectedRegions(text)
  assert(regions.length === 0, `contractions don't create protected regions (got ${regions.length})`)
  const { changes } = applyFixes(text, lints, regions)
  console.log(`  Changes on contraction text: ${changes.join(", ")}`)
}

{
  const text = 'The "misspelledd word" is outside'
  const lints = await runHarper(text)
  const regions = findProtectedRegions(text)
  const { changes } = applyFixes(text, lints, regions)
  const insideQuote = lints.find((l) => l.matched_text === "misspelledd")
  if (insideQuote) {
    assert(
      !changes.some((c) => c.includes("misspelledd")),
      "lints inside double quotes are skipped",
    )
  } else {
    assert(true, "no lints for quoted content")
  }
}

{
  const text = "I cloned the opencode source to /home/joao/Desktop/opencode. It has somee typos."
  const lints = await runHarper(text)
  const regions = findProtectedRegions(text)
  const { changes } = applyFixes(text, lints, regions)
  assert(
    !changes.some((c) => c.toLowerCase().includes("joao")),
    "file paths are not spell-corrected",
  )
  assert(
    changes.some((c) => c.includes("somee")),
    "typos outside paths are still corrected",
  )
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`pjx-pdf` is a single-file CLI that turns **Markdown or HTML** into PDF. It replaces the
"Markdown PDF" VSCode extension so documents can be generated from scripts and CI instead
of by hand.

The two modes share nothing but the browser and the output plumbing:

- **Markdown** (`build()`) — typeset a document: markdown-it → HTML → Tailwind → `page.pdf()`.
- **HTML** (`buildHtmlDeck()`) — screenshot a real page at a device viewport and cut it into
  screen-sized slices, one per PDF page. For reviewing design mockups on paper.

Mode is picked from the input extension. Mixing the two in one PDF is rejected: they need
different page geometries and a single `page.pdf()` call has one page size.

It exists because no off-the-shelf CLI covered all three requirements at once:

- `md-to-pdf` (simonhaenisch) has no native Mermaid support — the community `--config-file`
  workaround injects `mermaid.min.js` but **hangs**, because `md-to-pdf` calls `page.pdf()`
  without awaiting the async `mermaid.run()`. There is no hook to wait on.
- `mermaid-cli` (`mmdc -i in.md -o out.md`) pre-renders fences to SVG files, but it is a
  second tool in the chain and gives up control of diagram styling.
- Quarto has native Mermaid but its Mermaid→PDF path is a known hang (quarto-cli#6481).

Every one of those tools is a Puppeteer wrapper anyway, so this is the same approach with
the race condition removed and Tailwind swapped in for styling.

## Usage

Installed globally via `npm run install-global` (or `npm run link` for a live-editing
symlink; `npm run uninstall-global` to remove). Both chmod the entrypoint first — the
shebang is useless without the executable bit.

```bash
pjx-pdf <input.md> [more.md ...] [options]   # or: node pjx-pdf.mjs <input.md>

  -o, --out <file>          Output path (default: input with .pdf extension)
      --css <file>          Extra stylesheet appended after theme.css. Repeatable.
      --theme <name>        Mermaid theme: neutral | default | dark | forest
      --join <page|flow>    Page break between concatenated files, or continuous
      --preset <name>       default | readable | compact (two-column print layouts)
      --columns/--column-gap/--font-size/--margin/--figure-scale/--figures
      --mermaid-max-height  Individual layout knobs; each overrides the preset
      --page-numbers        Force on   /  --no-page-numbers to force off
      --page-number-format  Template with {page} and {total}
      --html                Also write the intermediate .html next to the output
      --watch               Rebuild on change (watches every input)
      --open                Open the PDF when done (macOS)
```

`npm run examples` renders all three files in `examples/`. Their PDFs are committed — they
are the README's screenshots, so regenerate them when output changes:

- `examples/markdown.md` exercises every Markdown feature (math, Mermaid, tables,
  Tailwind classes, task lists).
- `examples/page-desktop.html` and `examples/page-tablet.html` are HTML mode at the two
  page shapes: a wide layout on landscape A4 and a narrow one on portrait A4. Both are
  deliberately self-contained — no CDN, no remote fonts — so the output is reproducible
  offline and identical for everyone.

Driving use cases, both real:

- `pjx-pdf INDEX.md 0*.md -o doc.pdf` over a `docs/` folder — 9 files → 26 pages.
- `pjx-pdf landing.html --scroll 0.5` over a design mockup — 18k px page → 35 pages.

`--out` accepts a full path or a bare filename; `--out-dir` supplies the directory and is
created if missing. `resolveOutPath()` handles the combinations.

### Multiple inputs

Inputs are rendered in argument order and joined with a `break-before-page` div (or
nothing, under `--join flow`). Front-matter across files is merged **first-file-wins**
(`docs.reduce((merged, doc) => ({ ...doc.data, ...merged }), {})`), and only the first
file's title/subtitle/author/date reach `coverHeader()`. The TOC is built from the
combined HTML, so it spans every input.

`-o` is deliberately **required** for multiple inputs — defaulting to the first file's
name would silently overwrite a sibling of the sources.

## HTML mode

`buildHtmlDeck()` → `captureHtml()` per input → `planCuts()` → a shell page that lays the
slices out one per PDF page.

**Why screenshots and not `page.pdf()`.** Both were prototyped against a single-page
landing mockup 18k px tall. Letting Chrome paginate — 
`page.pdf({width: '1440px', height: '1018px'})` — produced a PDF that **did not match the
browser**: noticeably more content per page, because paged media re-lays-out the document
and `position: sticky/fixed` stop behaving as they do on screen. It was also *larger*
(87 MB vs 30 MB PNG / 10.7 MB JPEG). Screenshot slicing is pixel-exact by construction.
The tradeoff is that text is not selectable — accepted deliberately for design review.
Don't "improve" this back to vector without re-checking the fidelity.

**Viewport geometry.** `resolveView()` takes the width from a real CSS breakpoint (so
`tablet` renders the actual tablet layout) but derives the *height* from the A4 aspect
ratio, not from a real device. That is what makes every slice fill its page with no
letterboxing. Presets are landscape A4 for desktop/laptop, portrait for tablet/phone.

**Cut planning.** `--scroll` is the primary control: the step between captures as a
fraction of viewport height, i.e. literally "scroll this far, screenshot". 1 tiles the
document; 0.5 overlaps each page by half. The loop breaks once `y + viewH >= totalHeight`,
otherwise sub-1 scroll values would emit extra pages all showing the same bottom.
`--cut smart` ignores `--scroll` and snaps to element bottoms instead, refusing any
boundary that would fill less than 60% of a page.

**Page selection runs before capture.** `preparePage()` loads and measures a document and
returns its planned cuts without screenshotting; `buildHtmlDeck()` prepares every input,
resolves `--pages` against the *combined* count (so negative indices mean what they say
across a multi-file deck), then captures only the survivors via `captureSlice()`. Keep that
order — folding capture back into the prepare step would make `--pages` pay for slices it
throws away.

**Capture preconditions** — each exists because it broke something:

- The document is scrolled top-to-bottom once, then back to 0, to trigger lazy images.
  Returning to 0 also matters for `sticky`/`fixed` elements, which are captured where they
  sit at scroll 0 (so a sticky header appears on page 1 only, not on every page).
- Animations are paused and transitions disabled, so a slice can't catch a transition
  mid-flight.
- `document.fonts.ready` is awaited before measuring height.

**The shell page must be loaded from disk**, not `setContent()` — slices are referenced as
relative `<img src>`, and a `setContent()` page runs on an `about:blank` origin that cannot
read `file://` subresources. Slices go to a temp dir under `os.tmpdir()` (not into the
project, unlike the Tailwind temp dir) because they are large and never need module
resolution.

## Pipeline (Markdown mode)

The whole flow lives in `pjx-pdf.mjs`, in this order:

1. **Front-matter** — `gray-matter` splits YAML config from the body.
2. **Markdown → HTML** — `markdown-it` with `attrs` (so `{.text-red-600}` on a Markdown
   element becomes a real class), `task-lists`, and `anchor` (heading ids, needed for the
   TOC — configured with `tabIndex: false` so the markup stays clean).
   `highlight.js` colours code blocks at build time — deterministic, no browser work.
3. **Math → finished markup** — `@vscode/markdown-it-katex` typesets `$…$`, `$$…$$` and
   ```` ```math ```` fences with KaTeX, in Node. Nothing is deferred to the browser, so
   math cannot race `page.pdf()` the way Mermaid can — it belongs with `highlight.js` in
   step 2, not with Mermaid in step 5. Keep it that way.
4. **Local images → data URIs** — `inlineImages()` rewrites every `src` that points at a
   file on disk. Puppeteer gets the document through `setContent()`, so it runs on an
   `about:blank` origin that cannot read `file://` subresources: a relative `images/…` src
   resolves to nothing and Chrome draws its 14×16 broken-image icon, with **no error
   anywhere**. That is why this exists — the failure mode is a clean-looking `✓` and a PDF
   with no figures. Paths resolve against the directory of the Markdown that cited them, so
   inputs from different folders each keep their own images; unreadable ones are named in a
   warning above the summary line rather than swallowed.

5. **Mermaid fences → placeholders** — the custom fence rule emits
   `<figure class="mermaid" data-mermaid="<base64>">` instead of a code block. The source
   is base64'd so diagram text can't break out of the attribute.
6. **Tailwind compile** — `compileCss()` writes an entry stylesheet into a temp dir
   **inside this project** and shells out to the Tailwind v4 CLI with `@source` pointed at
   the generated HTML. The temp dir must live here so `@import "tailwindcss"` and
   `@plugin "@tailwindcss/typography"` resolve against our `node_modules`; a `/tmp` dir
   fails with `Can't resolve 'tailwindcss'`. The CSS is then inlined into the HTML.
7. **Puppeteer** — `setContent`, inject local `mermaid.min.js`, then `mermaid.render()`
   each placeholder **inside an awaited loop**, wait on `document.fonts.ready`, and only
   then call `page.pdf()`.

### The part that matters

Step 7 is the whole reason this tool exists. Mermaid rendering is asynchronous; if the PDF
is snapshotted before it resolves, diagrams come out blank or the process hangs. Any change
to `renderPdf()` must keep the render loop awaited before `page.pdf()`.

## Layout presets and columns

`--preset` resolves through `resolveLayout()` into a plain object — columns, gap, font
size, margin, figure scale, figure display, Mermaid cap — which `layoutCss()` turns into a
stylesheet. Measured on a 13-file, 188-figure lecture bundle: 144 pages single-column,
55 at `readable`, 27 at `compact`. Both are two-column; the tightened
vertical rhythm travels with `columns > 1`, not with the preset name, so `--columns 2`
alone still gets a usable layout.

CLI flags beat front-matter, which beats the preset. The preset values are **measured, not
derived** — `figureScale` is 0.375 at 6.05 pt and 0.685 at 9.9 pt, which is not
proportional, because those are the two points that were actually tuned on paper. Page
count scales roughly with the square of the body size, so aim with
`new = old × sqrt(target/actual)` and expect two iterations, scaling `figureScale` by the
same ratio. Above ~10 pt the relationship inverts: figures stop fitting a column, each one
forces a column break, and the count *rises*. If a size increase makes the PDF longer,
that is why.

`layoutCss()` is injected inside the Tailwind bundle **between `theme.css` and `--css`**
(see `compileCss()`). That ordering is the whole reason these rules need no `!important`:
they outrank the house style by source order, and a user stylesheet still outranks them.
Moving the injection into the `pageRules` block would silently invert the second half.

### Columns and page geometry do not mix by default

`groupSections()` wraps runs of ordinary content in `<div class="pjx-pdf-cols">` and leaves
`--horizontal` sections as siblings **outside** any wrapper. This is load-bearing: Chrome
cannot switch page size inside a fragmented multi-column container, so putting
`column-count` on `.doc` itself makes the named `@page` silently do nothing — verified,
`--horizontal` reported `1 landscape` while every MediaBox came out 595×842. Splitting the
container restores it (595×842, 842×595, 595×842). The cover header and TOC sit outside the
wrappers too, so they run the full page width instead of being trapped in one column.

Each wrapper starts a fresh column set, so content after a landscape section begins new
columns — free here, because a landscape section already forces a page break either side.

## Styling

`theme.css` is the house style — edit it to change every document at once. It is appended
to the Tailwind entry stylesheet, so `@theme`, `@layer base`, and plain CSS all work.

It is a port of the custom print stylesheet used with the Markdown PDF VSCode extension
this tool replaces: an editorial black & white print theme
built so nothing depends on colour to convey meaning. Margins (`1.6cm` × `1.4cm`) and the
`neutral` Mermaid theme match it. **Keep it monochrome-safe** — that is the point of the
theme, not an accident.

### Why not `prose`

Element rules are scoped to the `.doc` wrapper, not `@tailwindcss/typography`'s `prose`
class. The plugin's opinions fought this theme at every turn — most sharply because it
emits into the `components` cascade layer, which outranks anything in `@layer base`
regardless of selector specificity, so overrides had to sit unlayered to win. Styling
`.doc` directly avoids the whole fight and means Tailwind utilities on inline HTML always
take precedence. The plugin is still installed, so `prose` is available opt-in on a
specific element; Tailwind emits nothing for it while unused.

Because Tailwind scans the *generated HTML*, utility classes work in three places:

- the document wrapper in `wrapDocument()`
- inline HTML written directly in the Markdown
- `markdown-it-attrs` syntax: `## Heading {.text-right}`

Per-document overrides go through `--css`, which is appended after `theme.css` and wins.

`coverHeader()`, `buildToc()`, and the running header/footer use **inline styles**, not
utility classes: the header/footer render in a separate Puppeteer context the stylesheet
cannot reach, and keeping the cover/TOC consistent with them avoids two styling idioms
for the same furniture.

Page breaks are controlled with Tailwind's `break-inside-avoid` / `break-before-page`
utilities in the Markdown, or the legacy `<div class="page"></div>` helper kept for parity
with the old setup. `theme.css` already protects headings, tables, code blocks, and
figures.

Two rules there are load-bearing and easy to remove by accident: Mermaid SVGs need
`max-width: 100%` or they overflow the text column, and task-list `<ul>`s need their
markers suppressed.

### Math styling

KaTeX ships a complete stylesheet, so `theme.css` only settles it into the page — mainly
`break-inside: avoid` on `.katex-display`. Its 1.21em default size is left alone on
purpose: it is what makes formulas sit at the same optical weight as the serif body.

`katexCss()` inlines that stylesheet with each font face rewritten to a base64 `woff2` data
URI, for the same reason `loadLogo()` does: the document reaches Puppeteer through
`setContent()`, so it runs on an `about:blank` origin that cannot read `file://`
subresources and a relative `url(fonts/…)` would silently fall back to a system font. The
`woff`/`ttf` fallbacks are dropped — Chrome never asks for them and they double the size.

It is injected through its own `__PJX_PDF_MATH_CSS__` placeholder in `wrapDocument()`,
**before** the Tailwind `<style>` so theme rules and utilities can still override it, and
only when `hasMath()` finds typeset math in the body. Both placeholders are emptied for the
Tailwind scan pass — 300 KB of base64 is nothing but candidate noise to `@source`.

## Front-matter keys

```yaml
title: Report          # rendered into the cover header and the running header
subtitle: Q3 2026
author: Piotr
date: 2026-08-06
toc: true              # insert a table of contents from h2/h3
format: A4             # or Letter, Legal, …
landscape: false
landscape: true                    # or the --landscape flag
margin: { top: 1.6cm, right: 1.4cm, bottom: 1.6cm, left: 1.4cm }
header: '<div style="…">…</div>'   # raw HTML; inline styles only, Tailwind does not apply
footer: '<div style="…">…</div>'
pageNumbers: false                 # suppress the page counter
pageNumberFormat: 'Page {page} of {total}'
```

Header and footer templates render in a separate Puppeteer context that the page stylesheet
does not reach — they must use inline `style` attributes. That context also **does not fetch
external resources**, which is why `loadLogo()` inlines the image as a base64 data URI: a
`file://` path or URL in the footer silently renders nothing. Verified working for SVG,
which was the doubtful case.

`--logo-height` is checked against the bottom margin via `toMm()` before rendering, because
the footer is drawn inside that margin and an oversized logo would be clipped with no
warning. The error names the largest height that fits.

## Page geometry and mixed orientations

**Markdown mode never passes `format`/`landscape`/`margin` to `page.pdf()`.** All page
geometry is emitted as CSS by `pageCss()` and `page.pdf({preferCSSPageSize: true})` honours
it. This is deliberate and load-bearing: a single `page.pdf()` call applies one page size to
every page, so options-based geometry makes `--horizontal` impossible.

Chrome supports **named pages** — `@page pjx-pdf-landscape { size: A4 landscape }` plus
`.pjx-pdf-landscape { page: pjx-pdf-landscape }` — and switches the sheet mid-document. Verified
against the real output: `doc.pdf` reports 26 MediaBoxes at 595×842 and one at 842×595. No
PDF-merging library is involved, and none should be added.

`--horizontal FILE:START-END` flows through `parseHorizontal()` → `splitBlocks()`:

- Line numbers are 1-indexed **as the editor shows them**, so `frontMatterOffset()` maps
  them back onto the front-matter-stripped content gray-matter returns. Change one without
  the other and ranges silently shift.
- Each block is rendered by a separate `md.render()` call, so markdown-it state (reference
  links, footnotes) is not shared across a boundary and a range must not bisect a single
  construct. That is a documented constraint, not a bug to fix.
- A leading `@` is stripped — paths get pasted from Claude Code's file-reference syntax.

In HTML mode `--landscape`/`--portrait` override the preset's orientation in `resolveView()`
while keeping its width, so the same layout lands on differently shaped paper. Custom
`--view WxH` ignores the flag: its page shape follows the viewport ratio by definition.

`resolveChrome()` decides the running header/footer: CLI flags beat front-matter, which
beats the default of numbers-on. An explicit `footer` replaces numbering entirely.
`pageNumberHtml()` expands `{page}`/`{total}` into `<span class="pageNumber">` and
`<span class="totalPages">` — those exact class names are Puppeteer's API for
substitution, not a local convention. Puppeteer also falls back to its own date/title
chrome when a template is an empty string, so `renderPdf()` passes `<div></div>` for a
disabled half.

## Gotchas

- **Node ≥ 20** — the script uses `fs.watch` as an async iterator.
- YAML parses a bare `date:` into a `Date`, whose `toString()` is the ugly
  `Thu Aug 06 2026 02:00:00 GMT+0200`. `formatDate()` normalises it to an ISO day.
- `buildToc()` scrapes headings from the rendered HTML with a regex, so it must tolerate
  arbitrary attribute order — `markdown-it-attrs` classes and anchor ids both land there.
- Tailwind recompiles on every run (~1–2s). That is the cost of scanning the actual output
  for class names; do not cache it away without handling `--watch` invalidation.
- The intermediate `.html` is written to disk before the Tailwind step because `@source`
  needs a real file, then deleted unless `--html` was passed. It is built from the body with
  **original relative image srcs**; only the copy handed to Puppeteer has them inlined.
  Feeding megabytes of base64 to `@source` is nothing but candidate noise, the same reason
  both `<style>` placeholders are emptied for that pass. `--html` writes the inlined copy,
  which makes that file self-contained and portable.
- `separateImgBlocks()` inserts a blank line after a single-line raw `<img …>` whose next
  line is not blank: CommonMark would otherwise swallow the caption or a)/b) sub-label
  beneath it into the same HTML block and print it as literal `*a)*`. It runs per rendered
  block, **not** over the whole file — inserting lines earlier would shift the numbers
  `--horizontal` ranges are counted in.
- Mermaid failures are non-fatal by design: a broken diagram renders as red error text in
  the PDF and the run still succeeds. The summary line reports `rendered/total`.
- Math failures follow the same policy (`throwOnError: false`) and are counted the same
  way, but off the *markup* rather than reported back by the browser — the formulas are
  already typeset by the time Puppeteer sees them. `strict: false` too, so Unicode inside
  math is accepted instead of warned about.
- KaTeX cannot line-break a formula. A display equation wider than the text column prints
  into the margin; `theme.css` deliberately does **not** add `overflow: auto`, which is the
  web fix and on paper just clips. Split it with `aligned` at the source instead.

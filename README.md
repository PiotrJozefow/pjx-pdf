# pjx-pdf

Markdown **or** HTML → PDF from the command line. Mermaid diagrams, TeX math, Tailwind
styling, no VSCode.

```bash
pjx-pdf report.md
# ✓ report.pdf  (227 KB, 3/3 diagrams)

# Several files → one PDF, in the order given, one starting a new page
pjx-pdf INDEX.md 0*.md -o handbook.pdf
# ✓ handbook.pdf  (1156 KB, 9 files, 7/7 diagrams)

# A dense two-column handout for printing — 144 pages as one column, 27 as two
pjx-pdf index.md lecture-*.md --preset compact --join flow -o notes.pdf
# ✓ notes.pdf  (6322 KB, 13 files, 281/282 formulas, 188 figures, 2 columns)

# HTML: a long page cut into screen-sized views, one per PDF page
pjx-pdf landing.html --view laptop
# ✓ landing.pdf  (11.1 MB, 18 pages, laptop 1440×1018)
```

Two modes, chosen automatically from the input extension:

| Input | What you get |
| --- | --- |
| `.md` | Typeset document — serif print theme, Mermaid, math, syntax highlighting, TOC |
| `.html` | The page as it renders in a browser, sliced into device-viewport pages |

## Install

```bash
npm install
npm run install-global   # puts `pjx-pdf` on your PATH
```

Use `npm run link` instead if you want edits to the source to take effect immediately.
`npm run uninstall-global` removes it.

`pjx-pdf --help` prints the option reference plus a worked example of every feature.
`pjx-pdf --readme` prints this document.

### A `/make-pdf` skill for Claude Code

[`ADD_SKILL.md`](ADD_SKILL.md) is a prompt, not documentation. Point Claude Code at it —
*"read ADD_SKILL.md and follow it"* — and it interviews you about where PDFs should land,
whether the project has a logo, user- or project-level install, and a few other things,
then writes a `/make-pdf` skill tailored to that machine. Run it once per machine or
per repository; the file is self-contained, so the target machine needs only the CLI.

## Usage

```
pjx-pdf <input.md> [more.md ...] [options]
pjx-pdf <page.html> [more.html ...] --view laptop [options]

  -o, --out <file>          Output path, or a bare filename to place in --out-dir
                            (default: input with a .pdf extension)
  -d, --out-dir <dir>       Directory to write into. Created if missing.
      --css <file>          Extra stylesheet, appended after theme.css. Repeatable.
      --theme <name>        Mermaid theme: neutral | default | dark | forest
      --join <page|flow>    Between concatenated files: new page, or run straight
                            on. (default: page)
      --landscape           Horizontal pages for the whole document
      --portrait            Vertical pages (the default)
      --preset <name>       Markdown only. default | readable | compact.
                            readable is two columns at 9.9pt, compact two at
                            6.05pt. Sets columns, font size, margin and figure
                            scale together; any of them given explicitly wins.
      --columns <n>         Columns down the page, 1 to 4
      --column-gap <len>    Space between them (default: 1.1em)
      --font-size <len>     Body size, e.g. 9pt
      --margin <box>        Page margin as 1, 2 or 4 CSS lengths
      --figure-scale <n>    Zoom applied to images, scaling whatever size the
                            source asked for (default: per preset)
      --figures <block|inline>  block gives each image its own centred line;
                            inline leaves them in the text flow (default: block)
      --mermaid-max-height <len>  Diagram height cap (default: 45mm when there
                            is more than one column, uncapped otherwise)
      --horizontal <ranges> Markdown only. Put just these line ranges on their own
                            landscape pages, e.g. docs/08-security.md:32-51.
                            Comma-separate for several; repeatable.
      --logo <file>         Markdown only. Small logo at the bottom-left of every
                            footer. svg, png, jpg, gif, webp, avif.
      --logo-height <len>   Max logo height (default: 8mm)
      --page-numbers        Force page numbers on
      --no-page-numbers     Force page numbers off
      --page-number-format  Template, e.g. "Page {page} of {total}"
                            (default: "{page} / {total}")
      --html                Also write the intermediate .html next to the output
      --watch               Rebuild on change (watches every input)
      --open                Open the PDF when done (macOS)
      --help                Option reference with examples
      --readme              Print this document

HTML mode only:
      --view <preset|WxH>   desktop | laptop | tablet | phone, or e.g. 1280x800
                            (default: laptop)
      --scroll <0-1>        How far to advance between captures, as a fraction of
                            the viewport (default: 1)
      --cut <viewport|smart>  (default: viewport)
      --pages <spec>        Keep only these pages, e.g. 1-3,-2--1
      --scale <n>           Device pixel ratio for the capture (default: 2)
      --quality <1-100>     JPEG quality (default: 92)
      --png                 Lossless PNG instead of JPEG (much larger)
```

Every option also accepts `--flag=value`.

### Examples

`npm run examples` renders all three, and the committed PDFs next to them show what to
expect:

| Source | Command | Output |
| --- | --- | --- |
| [`examples/markdown.md`](examples/markdown.md) | `npm run example:markdown` | [`markdown.pdf`](examples/markdown.pdf) — every Markdown feature: math, Mermaid, tables, Tailwind classes |
| [`examples/page-desktop.html`](examples/page-desktop.html) | `npm run example:desktop` | [`page-desktop.pdf`](examples/page-desktop.pdf) — wide layout on landscape A4 |
| [`examples/page-tablet.html`](examples/page-tablet.html) | `npm run example:tablet` | [`page-tablet.pdf`](examples/page-tablet.pdf) — narrow layout on portrait A4 |

### Combining files

Inputs are concatenated in the order given, so shell globs work as long as the filenames
sort correctly — `INDEX.md 0*.md` above puts the index first and then `01-`…`08-`.

`-o` is required with more than one input; defaulting to the first file's name would
quietly overwrite a sibling of your sources.

Document-level front-matter (`format`, `margin`, `toc`, `pageNumbers`, …) is merged
**first-file-wins**, and only the first file's `title`/`subtitle`/`author`/`date` produce
the cover header. A `toc: true` on that first file builds a table of contents spanning
every input.

### Two-column layouts

For anything you intend to read on paper, `--preset` typesets the document as a dense
two-column handout. Two columns are what make small type work: they cut a 130-character
measure down to roughly 65, and a centred figure fills a column instead of stranding white
space beside it.

```bash
# Study notes: 13 files, 188 figures, 282 formulas, running straight on
pjx-pdf index.md wyklad-*.md --preset compact --join flow -o notes.pdf
# ✓ notes.pdf  (6322 KB, 13 files, 281/282 formulas, 188 figures, 2 columns)
```

| Preset | Body | Columns | Margin | Figure scale |
| --- | --- | --- | --- | --- |
| `default` | 11.5 pt | 1 | 1.6 × 1.4 cm | — |
| `readable` | 9.9 pt | 2 | 0.9 / 0.9 / 1.1 / 0.9 cm | 0.685 |
| `compact` | 6.05 pt | 2 | 0.9 / 0.9 / 1.1 / 0.9 cm | 0.375 |

That bundle runs to 144 pages as a single column at the default size: `readable` brings it
to 55 and `compact` to 27. `compact` sits at the floor of what a laser printer resolves — below about 6 pt the limit is toner scatter and paper fibre, not
the PDF — so print a page or two as a test before committing a long job.

Every knob is available on its own, and an explicit flag always beats the preset:

```bash
pjx-pdf notes.md --columns 2 --font-size 8pt          # no preset at all
pjx-pdf notes.md --preset compact --font-size 7pt --figure-scale 0.44
```

**Tuning.** Page count scales roughly with the square of the body size, so aim with
`new = old × sqrt(target / actual)` and expect two iterations. Scale `--figure-scale` by
the same ratio to keep figures in proportion to the text. Above about 10 pt the
relationship inverts: figures stop fitting a column, each one forces a column break, and
the count *rises*. If a size increase makes the PDF longer, that is why.

**Figures.** `--figures block` (the default) gives every image its own centred line, which
is right for notes whose images are one-per-line and sized by the source. Use
`--figures inline` for a document that sets its own `width=` and puts two figures on one
line — otherwise the pair gets stacked and the author's layout is lost.

**Diagrams.** In a narrow column a tall `flowchart TD` scales *up* to the column width and
can swallow a whole sheet, so multi-column layouts cap Mermaid at 45 mm
(`--mermaid-max-height`). The cap keeps a bad diagram on the page but cannot make it
legible: prefer `LR` over `TD` and labels of two to four words. A linear `A → B → C` chain
is a numbered list rendered at ten times the size, and a hierarchy of prose belongs in a
table.

### Orientation

`--landscape` turns the whole document horizontal; `--portrait` is the default. Both modes
accept them — in HTML mode the flag overrides the preset's paper orientation while keeping
its width, so `--view tablet --landscape` captures the tablet layout onto horizontal pages.

**Mixing orientations in one PDF.** `--horizontal` puts specific line ranges of specific
files on their own landscape pages, leaving everything else portrait. Useful for a wide
diagram or table that would otherwise be squeezed:

```bash
pjx-pdf INDEX.md 0*.md -o doc.pdf --horizontal=08-security-operations.md:32-51
# ✓ doc.pdf  (1158 KB, 9 files, 7/7 diagrams, 1 landscape)
```

The range is comma-separatable and the flag repeatable, so several sections across several
files work:

```bash
pjx-pdf INDEX.md 0*.md -o doc.pdf \
  --horizontal=08-security-operations.md:32-51,01-architecture.md:1-20 \
  --horizontal 02-data-model.md:1-15
```

Line numbers are 1-indexed exactly as your editor shows them, **front-matter included**. A
leading `@` is stripped, so a path pasted from Claude Code works as-is. The named file must
be one of the inputs.

Each range becomes its own block, rendered independently and forced onto a fresh landscape
page. So **pick section boundaries** — a range that cuts through a single Markdown
construct (half a table, half a code fence) will not render correctly.

### Logo

`--logo` puts a small mark at the bottom-left of every footer, opposite the page numbers.
Useful when you generate PDFs across several projects and want to tell them apart at a
glance:

```bash
pjx-pdf INDEX.md 0*.md -o doc.pdf --logo=../assets/logo.svg
```

Any raster or vector format works — `.svg`, `.png`, `.jpg`, `.gif`, `.webp`, `.avif`. The
file is inlined as a data URI, because header/footer templates render in an isolated
context that does not fetch external resources; a path or URL would silently render
nothing.

`--logo-height` caps the height (default `8mm`, any CSS length). The footer is drawn
*inside* the bottom margin, so a logo taller than it would simply be clipped — that is
rejected up front with the maximum that fits:

```
✗ --logo-height 20mm does not fit the 1.6cm bottom margin; use at most 13mm
  or increase the margin in front-matter
```

Width is capped at 45mm so a wide wordmark can't push the page numbers off the page. The
logo is rendered at 75% opacity to stay discreet, and appears on landscape pages too.

Set it per-document instead with `logo:` / `logoHeight:` in front-matter. An explicit
`footer:` replaces the whole footer, logo included.

### Page numbers

On by default, bottom-right, as `1 / 26`. Turn them off with `--no-page-numbers` or
`pageNumbers: false` in front-matter; restyle with
`--page-number-format "Page {page} of {total}"`. A `footer` in front-matter replaces
numbering entirely. CLI flags beat front-matter.

## Images

Local images just work, in Markdown or raw HTML, and are resolved against the directory of
the file that referenced them — so combining inputs from different folders keeps each
file's images pointing at its own:

```markdown
![Figure 1](images/bezier.svg)
<img src="images/raster.png" style="max-width:100%; max-height:350px;">
```

They are embedded in the PDF as data URIs. This is not an optimisation: the document
reaches the browser through `setContent()`, which runs on an `about:blank` origin that
cannot read `file://` subresources, so a relative path would otherwise resolve to nothing
and print as Chrome's broken-image icon — with no error, a clean `✓`, and a PDF quietly
missing every figure. The summary line counts what was embedded, and anything unreadable is
named:

```
! 2 image(s) could not be read; they will print broken:
    images/nope.png
    images/typo.svg
✓ notes.pdf  (6322 KB, 13 files, 188 figures, 2 columns)
```

Remote URLs and existing `data:` URIs are left untouched. `--html` writes the inlined copy,
so that file is self-contained and can be moved or emailed on its own.

## Front-matter

```yaml
---
title: Warehouse Report
subtitle: Q3 2026
author: Piotr Józefów
date: 2026-08-06
toc: true
format: A4
landscape: false
margin: { top: 18mm, right: 16mm, bottom: 18mm, left: 16mm }
preset: readable          # default | readable | compact
columns: 2                # with columnGap, fontSize, figureScale,
figures: block            # figures (block|inline) and mermaidMaxHeight
pageNumbers: true
---
```

Every layout key mirrors its CLI flag, and the flag wins when both are present.

`header` and `footer` accept raw HTML for the running page chrome. They render in a
separate browser context, so they need inline `style` attributes — the page stylesheet
does not reach them.

## Styling

`theme.css` is the house style for every document: an editorial black & white print theme
— warm serif body text, monochrome-safe code/links/tables, 1.6cm × 1.4cm margins. It is a
port of a custom print stylesheet used with the Markdown PDF VSCode extension, so output
should look like what that setup produced. The default Mermaid theme is `neutral` to match.

It is compiled by Tailwind v4, so `@theme`, `@layer`, `@utility`, and plain CSS all work.

Tailwind scans the *generated HTML*, which means utility classes work anywhere:

```markdown
## A right-aligned heading {.text-right}

<div class="grid grid-cols-3 gap-3 break-inside-avoid">
  <div class="rounded border border-neutral-300 p-4">…</div>
</div>
```

Element styling targets the `.doc` wrapper rather than Tailwind's `prose` class, so
utilities on inline HTML always win. `prose` remains available if you want it on a
specific element.

Page-break utilities (`break-inside-avoid`, `break-before-page`, `break-after-avoid`) are
the way to control pagination. Headings, tables, code blocks, and diagrams already avoid
breaking mid-element via `theme.css`.

For one-off documents, `--css overrides.css` is appended last and wins.

## HTML mode

Point it at an `.html` file and it renders the page in a real browser at a device viewport,
then cuts the long result into screen-sized slices — one per PDF page. Built for reviewing
design mockups on paper.

```bash
pjx-pdf designs/landing.html --view laptop            # A4 landscape, desktop layout
pjx-pdf designs/landing.html --view tablet            # A4 portrait, tablet layout
pjx-pdf designs/*.html --view laptop -o review.pdf    # whole folder → one deck
```

**Viewports.** Preset widths are the real CSS breakpoints, so `tablet` genuinely renders
the tablet layout, not a shrunken desktop one. Heights are derived from the A4 aspect
ratio rather than from real device heights, so every slice fills its page edge to edge
with no letterboxing:

| Preset | Viewport | Page |
| --- | --- | --- |
| `desktop` | 1728 × 1222 | A4 landscape |
| `laptop` | 1440 × 1018 | A4 landscape |
| `tablet` | 834 × 1180 | A4 portrait |
| `phone` | 390 × 552 | A4 portrait |

`--view 1280x800` takes an exact viewport instead; the page is then scaled to that ratio
with its long side at 297 mm.

**Where the cuts land.** `--scroll` sets how far to advance between captures, as a
fraction of the viewport — it is literally "scroll this far, take a screenshot":

- `--scroll 1` (default) tiles the page with no overlap; each PDF page is one clean screen.
- `--scroll 0.5` advances half a screen at a time, so consecutive pages overlap by half.
  Roughly doubles the page count, and guarantees anything straddling a cut is shown whole
  somewhere.

`--cut smart` ignores `--scroll` and instead pulls each cut back to the nearest element
boundary, so cards and sections are never sliced through — at the cost of whitespace at
the bottom of some pages.

**Keeping only some pages.** `--pages` selects from the captured sequence:

```bash
pjx-pdf landing.html --pages=1-3,-2--1
# ✓ landing.pdf  (2.7 MB, 5 of 18 pages, laptop 1440×1018)
```

Comma-separated tokens: `N` for one page, `A-B` for a range, and **negative indices count
from the end** — `-1` is the last page, so `-2--1` is the last two. Order within the spec
doesn't matter; output is always in document order. Out-of-range numbers are clamped, and
the summary line reports `kept of total` so a too-wide range stays visible.

Selection happens *before* capture — discarded pages never cost a screenshot, so pulling
five pages out of eighteen is roughly three times faster than rendering the lot.

**Fidelity.** Pages are captured as images, so the PDF matches the browser exactly —
fonts, gradients, shadows, responsive layout. Text is not selectable. Before scrolling
past, the whole document is scrolled once to trigger lazy-loaded images, animations are
paused so no slice catches a transition mid-flight, and fonts are awaited.

Output is JPEG at quality 92 by default (≈11 MB for an 18-page deck); `--png` is lossless
but roughly 3× larger. `--quality 80 --scale 1.5` cuts the size substantially with little
visible loss.

## Mathematical notation

TeX is typeset by [KaTeX](https://katex.org) while the Markdown is converted, in the same
pass that colours code — the HTML handed to the browser already contains finished formulas,
so unlike Mermaid there is nothing to wait for and nothing that can race the snapshot.

The delimiters are the usual ones:

| Syntax | Renders as |
| --- | --- |
| `$ … $` | Inline, in the run of the paragraph |
| `$$ … $$` on their own lines | Display: centred, on its own line, never split across a page break |
| ` ```math ` fence | The same as `$$ … $$`, for editors that prefer a fence |
| `\$` | An escaped dollar — stays literal text |

```markdown
The harmonic mean of $P$ and $R$ is $F = \dfrac{2PR}{P+R}$.

$$
d^2(x, u) = (x_1 - u_1)^2 + \cdots + (x_n - u_n)^2
$$
```

**What is supported.** Everything KaTeX supports, which is the TeX that documents actually
use: `\frac` `\dfrac` `\tfrac`, `\sum` `\prod` `\int` `\lim`, `\sqrt`, `\boxed`, sub- and
superscripts, Greek, `\mathbb` `\mathcal` `\mathbf` `\text`, `\left…\right` auto-sizing
delimiters, spacing (`\quad`, `\;`), and the `aligned`, `array`, `bmatrix`, `pmatrix`,
`cases` and `matrix` environments. The authoritative list is
[katex.org/docs/supported](https://katex.org/docs/supported.html).

**What is not.** KaTeX is a typesetter, not a TeX engine: no `\usepackage`, no macro
definitions, no `tikz`/`pgfplots`, no counters or cross-references. For a diagram, reach for
a Mermaid fence instead. KaTeX also cannot line-break a formula, so a display equation
wider than the text column prints into the margin — split it across an `aligned`
environment rather than fighting the CSS.

**Dollars in ordinary prose are safe.** `it costs $5 and the other $10` stays text — a
delimiter has to sit flush against the formula — and code spans are never scanned, so
`` `$HOME` `` and `` `$PATH` `` are untouched. Use `\$` when you want to be explicit.

Parsing is lenient (`strict: false`), so Unicode inside math is accepted rather than
warned about. A formula that fails to parse prints in red where it stood and the run still
succeeds — same policy as a broken diagram. The summary line counts them:

```bash
pjx-pdf paper.md
# ✓ paper.pdf  (412 KB, 1/1 diagrams, 63/64 formulas)
```

KaTeX's stylesheet and fonts are inlined into the document, so the PDF is self-contained —
but only for documents that actually contain math. Everything else is byte-for-byte
unaffected.

## Mermaid

Fenced ` ```mermaid ` blocks are rendered in the browser and **awaited** before the PDF is
taken. Flowcharts, sequence diagrams, Gantt charts, state diagrams, ER diagrams — anything
Mermaid 11 supports.

A diagram that fails to parse renders as red error text in the PDF and the run still
succeeds; the summary line reports how many of the total rendered.

## Using this from an AI agent

If you are an assistant running `pjx-pdf` on someone's behalf, the defaults produce a correct
PDF but rarely the *best* one. The options below exist because a human reviewing the output
usually wants one of these changes — offer them rather than waiting to be asked.

To bake this section into a reusable Claude Code skill, hand [`ADD_SKILL.md`](ADD_SKILL.md)
to Claude: it interviews the user about their machine and project, then writes a
`/make-pdf` skill carrying these conventions with the right defaults already filled in.

**Read the summary line. It is the only success signal.**
`✓ doc.pdf (1158 KB, 9 files, 7/7 diagrams, 63/64 formulas, 1 landscape)`. A `0/3 diagrams`
means Mermaid failed and the PDF contains red error text; `63/64 formulas` means a formula
failed to parse and prints in red where it stood. A page count far off what you expected
means a range or selection did something you didn't intend. A `! N image(s) could not be
read` warning above it means those figures will print as a broken-image icon — the paths
are listed, and they resolve relative to the Markdown file that cited them. Never report
success without reading it.

**Verify before claiming.** Open the result and look at it — page count, orientation, and
whether diagrams rendered. Especially check any page you deliberately changed.

### Ask these before rendering, not after

- **Which viewport, for HTML.** `laptop` and `tablet` produce genuinely different layouts —
  the tablet capture re-renders the responsive design, it is not a shrunken desktop. People
  usually want one specific view, or both as separate files. A full capture takes minutes,
  so asking first is cheaper than redoing it.
- **Where the file goes.** Write it next to its source, or wherever the user can actually
  open it — never a temp directory they can't find. State the path when you're done. `-d`
  places it elsewhere and creates missing directories.
- **One PDF or several,** when pointed at a folder. Combining is `pjx-pdf a.md b.md -o out.pdf`;
  separate invocations keep them apart. Argument order *is* document order, so check the
  glob sorts the way you want — `INDEX.md 0*.md` puts the index first, plain `*.md` won't.

### Offer a two-column layout for anything that will be printed

If the document is long and destined for paper — study notes, a handbook, a reference sheet
— `--preset readable` typically cuts the page count by about half and `--preset compact` by
about four fifths, at a measure that reads better than full-width small type. Offer it
rather than waiting to be asked; the default single column is the right choice only for
short documents and things read on screen.

Two things to check afterwards, because neither shows up in the summary line: that figures
still fit their column (scale `--figure-scale` down if a size increase made the PDF
*longer*), and that Mermaid diagrams are still legible under the 45 mm cap — a `flowchart
TD` with prose labels will be crushed, and the fix is `LR` and shorter labels, not more CSS.

### Offer to flip cramped content horizontal

Wide Mermaid diagrams (long `flowchart LR` chains, Gantt charts) and tables with many
columns get squeezed illegibly into a portrait text column. If you can see that a document
has one, propose putting just that section on a landscape page:

```bash
pjx-pdf INDEX.md 0*.md -o doc.pdf --horizontal=08-security-operations.md:32-51
```

To find the range: locate the section heading's line number, then the *next* heading's, and
end one line before it. Front-matter counts toward the numbers. Ranges must fall on section
boundaries — a range bisecting a table or code fence will not render.

For a document that is mostly wide content, `--landscape` for the whole thing is simpler
than many `--horizontal` ranges.

### Offer to drop repetitive pages

An 18-page design capture is often 3 interesting pages and 15 near-identical product grids.
Before handing over a large deck, ask whether they want the whole thing:

```bash
pjx-pdf landing.html --pages=1-3,-2--1     # hero and header, then footer
```

This is also the cheap option — selection happens before capture, so a 5-page selection
renders roughly 3× faster than the full document and produces a file a quarter the size.

### Watch the file size

HTML mode output is images. A full landing page runs 10–20 MB, and at `--scroll 0.5` it
doubles. If the PDF is going to be emailed or committed, suggest `--quality 80 --scale 1.5`
before generating, not after.

### Match the mode to the intent

- Reviewing *content* (docs, specs, reports) → Markdown mode. Text stays selectable.
- Reviewing *design* (mockups, layouts) → HTML mode, and ask which viewport matters.
  `--view tablet` genuinely re-renders the responsive layout; it is not a shrunk desktop.
- Don't mix `.md` and `.html` inputs — it is rejected, because one PDF has one page size.

### When cuts land badly

If a screenshot deck slices through cards or text mid-element, you have two fixes:
`--scroll 0.5` guarantees everything appears whole on *some* page, and `--cut smart` moves
each cut to an element boundary. Prefer `--cut smart` for a reference document, `--scroll
0.5` when the user needs to be sure nothing was missed.

### Practicalities that will otherwise bite you

- **Give it time.** A large HTML page takes minutes: it loads the page, scrolls the whole
  document to trigger lazy images, waits for fonts, then captures every slice. A run that
  looks hung is usually just working. Set a generous timeout rather than retrying blindly.
- **HTML with remote assets needs network.** Design mockups that pull Tailwind from a CDN,
  Google Fonts, or product images from a live site render blank or unstyled offline.
- **Check line ranges against the file.** Don't trust a number you were handed — read the
  section's heading line and the next heading's, and end one line before it. Being a few
  lines short silently clips the end of the section, and nothing warns you.
- **Front-matter improves a combined document.** `title`, `subtitle`, `author`, `date` and
  `toc: true` on the *first* input produce a cover header and a contents page spanning all
  the files. Worth adding when assembling a folder into a deliverable.
- **Offer the project logo.** If the repo has one (`public/logo/`, `assets/`, `static/`),
  `--logo` makes the PDF instantly identifiable among documents from other projects. Worth
  suggesting for anything the user will keep rather than read once.
- **`--watch` for iteration.** If the user is tweaking `theme.css` or the source, leave it
  watching instead of re-running by hand.

## Why not an existing tool

| Tool | Problem |
| --- | --- |
| `md-to-pdf` | No native Mermaid. The `--config-file` workaround hangs — it calls `page.pdf()` without awaiting the async `mermaid.run()`, and exposes no hook to wait on. |
| `mermaid-cli` | Pre-renders fences to separate SVG files. Works, but it's a second tool in the chain and you lose control of diagram styling. |
| Quarto | Native Mermaid, but Mermaid→PDF is a known hang (quarto-cli#6481). |
| Markdown PDF (VSCode) | Can't be scripted — the whole reason for this. |

All of them are Puppeteer wrappers underneath. This is the same approach with the race
condition removed and Tailwind in place of a fixed stylesheet.

See `CLAUDE.md` for the internals.

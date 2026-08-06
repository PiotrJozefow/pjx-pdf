# Install the `/make-pdf` skill

**How to use this file.** Open Claude Code on the machine you want the skill on and say:

> Read ADD_SKILL.md and follow it.

or paste the whole file into the prompt. Everything Claude needs is in here — the target
machine does not need this repository checked out, only the `pjx-pdf` CLI on `PATH`, and
Claude will offer to install it if it isn't there.

---

## Instructions for Claude

You are installing a `/make-pdf` skill tailored to **this** machine and **this** user. The
skill wraps the `pjx-pdf` CLI, which turns Markdown or HTML into PDF.

Do not copy the template at the bottom verbatim. Interview the user first, then write a
skill that reflects their answers, with the branches that do not apply **deleted** rather
than left in as dead advice. A skill full of "if X then Y" that never applies here is worse
than no skill.

### Step 0 — Preflight, before asking anything

Run these and use the results to inform the questions. Do not make the user tell you what
you can find out yourself.

```bash
command -v pjx-pdf >/dev/null && echo "pjx-pdf: installed" || echo "pjx-pdf: MISSING"
node --version                                   # must be >= 20
uname -s                                         # Darwin = macOS, so --open works
[ -d ./tmp ] && echo "./tmp exists" || echo "no ./tmp here"
ls -d ~/.claude/skills .claude/skills 2>/dev/null # which skill dirs already exist
git rev-parse --show-toplevel 2>/dev/null        # are we in a project at all
```

Also look for a logo, so you can *offer* a path instead of asking the user to recall one:

```bash
find . -maxdepth 4 \( -path ./node_modules -o -path ./.git \) -prune -o \
  -iregex '.*/\(logo\|brand\|icon\|wordmark\)[^/]*\.\(svg\|png\|jpg\|webp\)' -print 2>/dev/null | head
```

**If `pjx-pdf` is missing**, stop and sort that out first — a skill wrapping a CLI that
isn't there is useless. Ask the user where they keep checkouts, clone the repository this
file came from, and install it:

```bash
cd <wherever they said> && git clone <pjx-pdf repository URL> && cd pjx-pdf
npm install && npm run install-global
```

Then re-run the check. If they'd rather not install globally, note the absolute path to
`pjx-pdf.mjs` and use `node /abs/path/pjx-pdf.mjs` everywhere in the skill instead of the
bare `pjx-pdf` command.

### Step 1 — Interview

Ask with `AskUserQuestion` (up to 4 questions per call, so this is two rounds). Lead with
the recommended option and mark it `(Recommended)`. Every question needs a sensible default
so the user can wave you through.

**Round 1 — the essentials**

1. **Scope.** User level or project level?
   - `~/.claude/skills/make-pdf/SKILL.md` — available in every project on this machine.
     *(Recommended when they render documents across several repos.)*
   - `.claude/skills/make-pdf/SKILL.md` — this repository only, and committable, so
     teammates get it too. *(Recommended when the answers below are project-specific — a
     logo path or a fixed output folder usually means project level.)*

2. **Default output location.** Where should PDFs land when the user doesn't say?
   - `./tmp` when it already exists, otherwise next to the source *(Recommended — never
     creates a folder the repo didn't ask for)*
   - Always next to the source file
   - Always a fixed folder — ask which, and whether to create it if missing
   - Ask every time

   Note what you found in preflight: if `./tmp` doesn't exist here, say so, because option
   one then behaves as "next to the source" until they make one.

3. **Logo.** `--logo` puts a discreet mark bottom-left of every footer. Offer any candidate
   paths preflight turned up.
   - A specific file, used by default on every render
   - A specific file, but only offered, not applied automatically *(Recommended — a footer
     mark is unwanted on scratch renders)*
   - No logo

   If they pick a file, confirm the max height (`--logo-height`, default `8mm`) and check
   it fits: the footer is drawn inside the bottom margin, and `pjx-pdf` rejects an
   oversized logo rather than clipping it silently.

4. **HTML viewport.** HTML mode screenshots a page at a device viewport and cuts it into
   pages. Which default?
   - Always ask *(Recommended — `laptop` and `tablet` are genuinely different layouts and a
     capture takes minutes, so guessing wrong is expensive)*
   - `desktop` (1728px, landscape A4) / `laptop` (1440px, landscape A4)
   - `tablet` (834px, portrait A4) / `phone` (390px, portrait A4)

   If the project has no HTML mockups at all — check for `.html` files — say so and offer
   to leave HTML mode out of the skill entirely. A shorter skill is a better skill.

**Round 2 — the details** (skip any the first round already settled)

5. **Paper size.** `A4` *(default)* or `Letter`. Worth asking outside Europe; if their
   documents already carry `format:` in front-matter, this rarely matters.

6. **Open when done.** `--open` opens the PDF on completion. macOS only — only offer it if
   preflight printed `Darwin`. *(Recommended: on. The point of a render is to look at it.)*

7. **Where the documents live.** A folder like `docs/`, `notes/`, or `designs/` that the
   skill should search first when the user doesn't name a file. Optional, but it makes
   document detection much less guessy in a large repo.

8. **Combined-PDF naming.** With several inputs, `pjx-pdf` requires an explicit output
   name. Ask for a preferred slug convention — most people want the containing folder's
   name (`docs/*.md` → `<project>-docs.pdf`). Record the actual project name so the
   examples in the skill are real ones, not placeholders.

9. **Anything else that always applies here** — a house `--css` override, a standing
   `--quality`/`--scale` for size-sensitive output, `--no-page-numbers`. Ask openly; skip
   if they have nothing.

### Step 2 — Write the skill

Create the directory and write `SKILL.md` from the template below, with these rules:

- **Substitute every `{{PLACEHOLDER}}`** with the real answer.
- **Delete branches that don't apply.** No logo → delete the logo bullet and every `--logo`
  flag from the examples. Fixed output folder → replace the whole of section 3 with that
  one rule; the `./tmp` check exists only to serve the conditional policy. No HTML in this
  project → delete the viewport question, the HTML examples and the cut/pages advice.
- **Make the examples real.** Use this project's actual filenames and folders. A skill that
  says `pjx-pdf REPORT.md` when the repo contains `docs/01-architecture.md` reads as
  boilerplate and gets ignored.
- **Keep the frontmatter `description` accurate**, including the output policy — it is what
  Claude reads when deciding whether to invoke the skill, and it is the only part
  guaranteed to be in context.

The frontmatter `name` must match the directory name. If a `make-pdf` skill already exists
at the chosen scope, **read it first and show the user what would change** — do not
overwrite without asking.

### Step 3 — Verify, then report

1. Confirm the file is where you think: `cat <path>/SKILL.md | head -5`.
2. Render something real end to end — an actual document from this project, not a fixture —
   using the exact command the skill prescribes. Check the summary line and open the PDF.
3. Tell the user the skill's path, that `/make-pdf` picks it up in a **new** session, and
   the two or three defaults you baked in, so they know what to override.

Report what actually happened. If the test render failed, say so with the output.

---

## Reference: what `pjx-pdf` does

Enough to write the skill accurately. `pjx-pdf --help` on the target machine is
authoritative and includes a worked example of every feature; `pjx-pdf --readme` prints the
full documentation. Prefer those over anything below if they disagree.

**Two modes, chosen from the input extension.**

| Input | Output |
| --- | --- |
| `.md` | Typeset document — serif print theme, Mermaid diagrams, KaTeX math, syntax highlighting, optional TOC |
| `.html` | The page as a browser renders it, screenshotted and cut into device-viewport pages |

The two cannot be combined into one PDF: a single PDF has one page size.

**Options that matter for a skill.**

| Flag | Effect |
| --- | --- |
| `-o, --out` | Output path, or a bare filename to place inside `--out-dir` |
| `-d, --out-dir` | Directory to write into — **created if missing** |
| `--horizontal FILE:START-END` | Render just those 1-indexed lines on their own landscape pages |
| `--landscape` | The whole document sideways |
| `--logo` / `--logo-height` | Discreet footer mark, max height (default `8mm`) |
| `--view <preset\|WxH>` | HTML only: `desktop` `laptop` `tablet` `phone` |
| `--pages <spec>` | HTML only: keep only these pages; negative counts from the end |
| `--quality` / `--scale` | HTML only: JPEG quality (default 92), capture DPR (default 2) |
| `--cut <viewport\|smart>` | HTML only: fixed steps, or snap each cut to an element boundary |
| `--open` | Open the PDF when done (macOS) |

**Success signal.** The summary line is the only one:

```
✓ ./tmp/doc.pdf  (1174 KB, 9 files, 7/7 diagrams, 63/64 formulas, 1 landscape)
```

`0/3 diagrams` means Mermaid failed and the PDF has red error text where diagrams should
be. `63/64 formulas` means one formula failed to parse and prints in red. Both are
non-fatal — the run still exits 0 — so reading the line is the only way to notice.

---

## Template: `SKILL.md`

Everything below the line is the skill body. Adapt it; do not paste it.

---

````markdown
---
name: make-pdf
description: Render a document to PDF with the pjx-pdf CLI. Use when the user invokes /make-pdf — takes an explicit file, or works out which document they were most recently working on and whether it is Markdown or HTML. {{OUTPUT_POLICY_ONE_LINE}}
---

# Make PDF

Render a document to PDF using `pjx-pdf`, invoked with `/make-pdf [file] [instructions]`.

{{INVOCATION_NOTE — "Installed globally as `pjx-pdf`." or "Run it as
`node {{ABS_PATH}}/pjx-pdf.mjs`."}} Run `pjx-pdf --help` for the full option reference — it
includes a worked example of every feature.

## 1. Work out which document

In order of preference:

1. **An explicit path in the invocation** — `/make-pdf {{DOCS_DIR}}/REPORT.md`. Use it.
2. **The document from this conversation.** Pick the most recent `.md` or `.html` file the
   user was actually working on — one they wrote, edited, reviewed, or asked about. Prefer
   the file most recently *touched* over the one most recently *mentioned in passing*.
   {{IF DOCS_DIR: "Documents in this project normally live in `{{DOCS_DIR}}/` — look there
   first."}}
3. **Ask.** If several documents are plausible, or none clearly is, ask rather than guess.
   A wrong guess wastes a slow render. Offer the candidates you found:

   > Which document should I render?
   > 1. `{{REAL_EXAMPLE_1}}` — you edited this a few messages ago
   > 2. `{{REAL_EXAMPLE_2}}` — you reviewed this earlier

**Never** pick `CLAUDE.md`, `README.md`, or a skill file just because it was read as
background context. Those are almost never what the user means.

If the user names a *folder* of documents, treat that as a combined PDF (see below) but
confirm the order and that they want one file rather than several.

## 2. Pick the mode

The extension decides it, and `pjx-pdf` switches automatically:

- `.md` → typeset document (serif print theme, Mermaid diagrams, KaTeX math, highlighting)
- `.html` → the page as a browser renders it, cut into device-viewport pages

**HTML and Markdown inputs cannot be combined** into one PDF — one PDF has one page size.
If the user asks for both, produce two PDFs.

{{IF HTML_VIEWPORT == ask}}
**For HTML, ask which viewport** unless they already said. The presets produce genuinely
different responsive layouts and a full capture takes minutes, so asking is cheaper than
redoing it:

> Which view — `laptop` (A4 landscape) or `tablet` (A4 portrait)? Or both, as two files.
{{ELSE}}
**For HTML, default to `--view {{HTML_VIEWPORT}}`.** Mention the alternatives only if the
user's request implies a different device.
{{END}}

## 3. Output location

{{OUTPUT_SECTION — write exactly one of these, delete the rest.}}

{{IF conditional-tmp}}
Unless the user says otherwise, decide like this — **check first, do not create anything**:

1. **`./tmp/` exists** in the current working directory → write there.
2. **It does not exist** → write **next to the source file**, same basename. Do **not**
   create a `tmp/` directory.

```bash
[ -d ./tmp ] && echo "tmp exists" || echo "no tmp"
```

This matters: `pjx-pdf -d` creates missing directories, so passing `-d ./tmp`
unconditionally would silently litter a repo with a `tmp/` folder. Check, then choose.
{{END}}

{{IF fixed-folder}}
Write to `{{OUTPUT_DIR}}` unless the user says otherwise: `-d {{OUTPUT_DIR}}`. `pjx-pdf`
creates it if missing.
{{END}}

{{IF alongside-source}}
Write next to the source file, same basename. Pass no `-d` at all.
{{END}}

### Naming a combined PDF

With several inputs there is no single source name, so **invent a meaningful slug** —
lowercase, hyphenated, no dates or version numbers. Derive it from what the documents
actually are: the containing folder, the shared topic, or the title in the first file's
front-matter. {{IF NAMING_CONVENTION: state it here, with a real example from this repo.}}

Never let a combined PDF inherit the first input's name — `INDEX.pdf` for a nine-file
handbook is actively misleading. `pjx-pdf` enforces this by *requiring* `-o` or `-d` for
multiple inputs, so you must make the choice deliberately.

Use `-o` with an explicit path or filename whenever the user asks for one. Always state
the final path in your reply — a PDF the user cannot find is not delivered.

## 4. Run it

{{Real commands for this project. Keep every standing default visible in them —
{{LOGO_FLAG}}, {{PAPER_FLAG}}, {{OPEN_FLAG}} — so nobody has to remember them.}}

```bash
# Single document
pjx-pdf {{REAL_EXAMPLE_1}} {{STANDING_FLAGS}}

# Several files as one document — argument order is document order, so check the
# glob sorts the way you want (INDEX.md 0*.md, not *.md)
pjx-pdf {{REAL_GLOB}} -o {{REAL_SLUG}}.pdf {{STANDING_FLAGS}}

# HTML at a chosen viewport
pjx-pdf {{REAL_HTML_EXAMPLE}} --view {{HTML_VIEWPORT}} {{STANDING_FLAGS}}
```

Give it a **generous timeout**. A large HTML page takes minutes — it loads the page,
scrolls the whole document to trigger lazy images, waits for fonts, then captures every
slice. A run that looks stuck is usually just working; do not retry blindly.

HTML with remote assets (CDN Tailwind, Google Fonts, images from a live site) needs
network access, or it renders blank and unstyled.

## 5. Offer improvements

The defaults give a correct PDF, rarely the best one. Suggest these when they apply —
briefly, in your reply, without blocking on an answer for a first render:

- **Wide content squeezed into a portrait column.** Long `flowchart LR` diagrams, Gantt
  charts and many-column tables become illegible. Put just that section sideways:
  `--horizontal=FILE:START-END`. Find the range by reading the section's heading line and
  the next heading's, ending one line before it — **verify against the file**, since being
  a few lines short silently clips the end of the section. Front-matter counts toward the
  numbers, and a range must not bisect a table or code fence. For a document that is mostly
  wide, `--landscape` for the whole thing is simpler.
- **A display formula running into the margin.** KaTeX cannot line-break; the fix is at the
  source — split it across an `aligned` environment.
- **Repetitive HTML pages.** An 18-page capture is often 3 interesting pages and 15
  near-identical grids. `--pages=1-3,-2--1` keeps the first three and last two; negative
  indices count from the end. It is also ~3× faster and a quarter the size, because skipped
  pages are never captured.
- {{IF LOGO — keep one of these, delete the other:}}
  {{always}} The project logo at `{{LOGO_PATH}}` is applied by default. Drop `--logo` if
  the user wants a plain footer.
  {{on-request}} **A logo.** `--logo {{LOGO_PATH}}` puts a discreet mark bottom-left of
  every footer, which makes the PDF identifiable among documents from other projects.
  Worth offering for anything the user will keep rather than read once.
- **File size.** HTML output is images: 10–20 MB is normal, double that at `--scroll 0.5`.
  If it will be emailed or committed, `--quality 80 --scale 1.5` cuts it a lot with little
  visible loss.
- **Cuts landing badly** in an HTML capture: `--cut smart` moves each cut to an element
  boundary; `--scroll 0.5` instead guarantees everything appears whole on some page.

## 6. Verify before reporting

**Read the summary line — it is the only success signal:**

```
✓ {{EXAMPLE_OUT_PATH}}  (1174 KB, 9 files, 7/7 diagrams, 63/64 formulas, 1 landscape)
```

- `0/3 diagrams` means Mermaid failed and the PDF contains red error text. Investigate.
- `63/64 formulas` means a formula failed to parse and prints in red where it stood.
- A page count far off expectations means a range or selection did something unintended.

Then open the PDF and look at it — page count, orientation, and whether diagrams and
formulas rendered. Check any page you deliberately changed. Report the path and page count
plainly; if something failed, say so with the output rather than claiming success.
````

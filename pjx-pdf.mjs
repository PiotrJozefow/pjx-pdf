#!/usr/bin/env node
/**
 * pjx-pdf — Markdown → HTML → PDF via Puppeteer.
 *
 * Styling is Tailwind (v4) + @tailwindcss/typography, compiled per-run against the
 * generated HTML so arbitrary utility classes in the Markdown work. Mermaid fences are
 * rendered in-page and explicitly awaited before the PDF is produced.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import katexPlugin from '@vscode/markdown-it-katex';
import matter from 'gray-matter';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import attrs from 'markdown-it-attrs';
import taskLists from 'markdown-it-task-lists';
import puppeteer from 'puppeteer';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

/** Bad invocation — reported as a one-line message, not a stack trace. */
class UsageError extends Error {}

/* ------------------------------------------------------------------ args -- */

function parseArgs(rawArgv) {
  // Accept both `--flag value` and `--flag=value`.
  const argv = rawArgv.flatMap((arg) => {
    const match = /^(--[a-z-]+)=([\s\S]*)$/.exec(arg);
    return match ? [match[1], match[2]] : [arg];
  });

  const opts = {
    inputs: [],
    out: null,
    outDir: null,
    css: [],
    theme: 'neutral', // grayscale — matches the monochrome print theme
    join: 'page',
    orientation: null, // null → per-preset (HTML) or front-matter (Markdown)
    logo: null, // image inlined into the footer, bottom-left
    logoHeight: null,
    horizontal: [], // Markdown: "file.md:32-50" ranges forced onto landscape pages
    view: 'laptop', // HTML mode only
    cut: 'viewport',
    pages: null, // which captured pages to keep, e.g. "1-3,-2--1"
    scroll: 1, // fraction of a viewport to advance between captures
    scale: 2,
    quality: 92,
    png: false,
    pageNumbers: undefined, // undefined → fall back to front-matter, then the default
    pageNumberFormat: null,
    html: false,
    watch: false,
    open: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o' || arg === '--out') opts.out = argv[++i];
    else if (arg === '-d' || arg === '--out-dir') opts.outDir = argv[++i];
    else if (arg === '--css') opts.css.push(argv[++i]);
    else if (arg === '--theme') opts.theme = argv[++i];
    else if (arg === '--join') opts.join = argv[++i];
    else if (arg === '--landscape') opts.orientation = 'landscape';
    else if (arg === '--portrait') opts.orientation = 'portrait';
    else if (arg === '--horizontal') opts.horizontal.push(argv[++i]);
    else if (arg === '--logo') opts.logo = argv[++i];
    else if (arg === '--logo-height') opts.logoHeight = argv[++i];
    else if (arg === '--view') opts.view = argv[++i];
    else if (arg === '--cut') opts.cut = argv[++i];
    else if (arg === '--pages') opts.pages = argv[++i];
    else if (arg === '--scroll') opts.scroll = Number(argv[++i]);
    else if (arg === '--scale') opts.scale = Number(argv[++i]);
    else if (arg === '--quality') opts.quality = Number(argv[++i]);
    else if (arg === '--png') opts.png = true;
    else if (arg === '--page-numbers') opts.pageNumbers = true;
    else if (arg === '--no-page-numbers') opts.pageNumbers = false;
    else if (arg === '--page-number-format') opts.pageNumberFormat = argv[++i];
    else if (arg === '--html') opts.html = true;
    else if (arg === '--watch') opts.watch = true;
    else if (arg === '--open') opts.open = true;
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--readme') opts.readme = true;
    else opts.inputs.push(arg);
  }

  return opts;
}

const USAGE = `
pjx-pdf — Markdown → PDF with Mermaid, math and Tailwind, or HTML → PDF as screen views

  pjx-pdf <input.md> [more.md ...] [options]
  pjx-pdf <page.html> [more.html ...] --view laptop [options]

Multiple inputs are concatenated into a single PDF, in the order given.
-o (or -d) is required when there is more than one input. HTML and Markdown
inputs cannot be mixed in one PDF.

Options
  -o, --out <file>            Output path, or a bare filename to place in --out-dir
                              (default: input with a .pdf extension)
  -d, --out-dir <dir>         Directory to write into. Created if missing.
      --css <file>            Extra stylesheet, appended after Tailwind. Repeatable.
      --theme <name>          Mermaid theme: default | neutral | dark | forest
      --join <page|flow>      Between concatenated files: start a new page, or run
                              straight on. (default: page)
      --landscape             Horizontal pages for the whole document
      --portrait              Vertical pages (the default)
      --horizontal <ranges>   Markdown only. Render just these line ranges on their
                              own landscape pages, e.g.
                                --horizontal=docs/08-security.md:32-51
                              Comma-separate for several; repeatable. Line numbers
                              are 1-indexed as your editor shows them, front-matter
                              included. Pick section boundaries — a range must not
                              cut through a single Markdown construct.
      --logo <file>           Markdown only. Image rendered small and discreet at
                              the bottom-left of every footer — handy for telling
                              projects apart at a glance. svg, png, jpg, gif,
                              webp, avif.
      --logo-height <len>     Max logo height, any CSS length. Must fit inside the
                              bottom margin. (default: 8mm)
      --page-numbers          Force page numbers on
      --no-page-numbers       Force page numbers off
      --page-number-format    Template, e.g. "Page {page} of {total}"
                              (default: "{page} / {total}")
      --html                  Also write the intermediate .html next to the output
      --watch                 Rebuild on file change
      --open                  Open the PDF when done (macOS)
  -h, --help                  This message
      --readme                Print the full documentation

Every option also accepts the --flag=value form.

HTML mode (inputs ending .html/.htm) — the page is rendered at a device
viewport and cut into screen-sized slices, one per PDF page
      --view <preset|WxH>     desktop | laptop | tablet | phone, or e.g. 1280x800.
                              Landscape A4 for desktop/laptop, portrait for the
                              rest. (default: laptop)
      --scroll <0-1>          How far to advance between captures, as a fraction
                              of the viewport. 1 tiles the page with no overlap;
                              0.5 captures every half-scroll. (default: 1)
      --cut <viewport|smart>  viewport honours --scroll; smart instead snaps each
                              cut to an element boundary so nothing is sliced
                              through. (default: viewport)
      --pages <spec>          Keep only these pages. Comma-separated; N for one,
                              A-B for a range, negative counts from the end, e.g.
                                --pages=1-3,-2--1    first three and last two
                              Output stays in document order.
      --scale <n>             Device pixel ratio for the capture. (default: 2)
      --quality <1-100>       JPEG quality. (default: 92)
      --png                   Capture lossless PNG instead of JPEG (much larger)

Mathematical notation (Markdown only) — TeX typeset by KaTeX at build time

  $ ... $        Inline, within a paragraph:  the mean $\\bar{x}$ of $n$ samples
  $$ ... $$      Display, on lines of its own, centred and never split across a
                 page break
  \`\`\`math        A fenced block, equivalent to $$ ... $$
  \\$             An escaped dollar stays literal text

  KaTeX covers the TeX that documents actually use: \\frac, \\sum, \\prod, \\int,
  \\sqrt, \\boxed, sub/superscripts, Greek, \\mathbb/\\mathcal/\\text, \\left…\\right
  delimiters, and the aligned, bmatrix, pmatrix, cases and array environments.
  It is not a full TeX engine — no macro definitions, no \\usepackage, no
  tikz/pgfplots. The complete list is at katex.org/docs/supported.
  A formula that fails to parse prints in red in its place and the run still
  succeeds, exactly like a broken Mermaid diagram.

Front-matter keys (all optional)
  title, subtitle, author, date   Rendered into the cover header
  format                          A4 | Letter | ...           (default: A4)
  landscape                       true | false
  margin                          { top, right, bottom, left }
  header, footer                  HTML for the running header/footer
  logo, logoHeight                Same as --logo / --logo-height
  toc                             true → insert a table of contents
  pageNumbers                     true | false
  pageNumberFormat                Template, as above

With several inputs, document-level keys are merged first-file-wins, and only the
first file's title/subtitle/author/date produce the cover header.

Examples

  Single document, next to the source as report.pdf
    pjx-pdf report.md

  A folder of docs as one deliverable (order follows the arguments, so the glob
  must sort correctly). -o or -d is required for more than one input.
    pjx-pdf INDEX.md 0*.md -o doc.pdf

  Put one wide section on its own landscape page, rest stays portrait
    pjx-pdf INDEX.md 0*.md -o doc.pdf --horizontal=08-security-operations.md:32-51

  Several horizontal sections across several files
    pjx-pdf INDEX.md 0*.md -o doc.pdf \\
      --horizontal=08-security.md:32-51,01-architecture.md:1-20 \\
      --horizontal 02-data-model.md:1-15

  The whole document horizontal
    pjx-pdf slides.md --landscape

  Brand it, so you can tell projects apart at a glance
    pjx-pdf report.md --logo assets/logo.svg
    pjx-pdf report.md --logo logo.png --logo-height 10mm

  Custom page numbering, or none
    pjx-pdf report.md --page-number-format "Page {page} of {total}"
    pjx-pdf report.md --no-page-numbers

  Write into a directory, creating it if needed
    pjx-pdf report.md -o handbook.pdf -d ~/Documents/exports

  Rebuild on every save
    pjx-pdf report.md --watch

  HTML design mockup as laptop-sized pages
    pjx-pdf landing.html --view laptop

  Same page at tablet width, on portrait paper
    pjx-pdf landing.html --view tablet

  Capture every half-scroll, so nothing straddling a cut is only seen in halves
    pjx-pdf landing.html --scroll 0.5

  Never slice through a card or section (whitespace at page bottoms instead)
    pjx-pdf landing.html --cut smart

  Keep only the first three pages and the last two
    pjx-pdf landing.html --pages=1-3,-2--1

  A whole design folder as one review deck
    pjx-pdf designs/*.html --view laptop -o review.pdf

  Smaller file for sharing
    pjx-pdf landing.html --quality 80 --scale 1.5

Notes for AI agents

  Ask before rendering, not after:

  - Which viewport, for HTML. laptop and tablet produce genuinely different
    layouts, and people usually want a specific one — or both as separate files.
    Ask instead of defaulting; a full capture is slow to redo.

  - Where the file goes. Write it next to its source, or wherever the user can
    actually open it — never a temp directory. State the path when done. Use
    -d to place it elsewhere; missing directories are created.

  - One PDF or several, when handed a folder. "pjx-pdf a.md b.md -o out.pdf"
    combines; separate invocations keep them apart. Argument order is document
    order, so check the glob sorts the way you want (INDEX.md 0*.md, not *.md).

  The defaults give a correct PDF, rarely the best one. Offer these rather than
  waiting to be asked:

  - Cramped wide content. Long flowcharts, Gantt charts and many-column tables
    are illegible in a portrait column. Put just that section sideways with
    --horizontal=FILE:START-END (find the range from the section heading to one
    line before the next heading; front-matter counts toward the numbers). Use
    --landscape instead when most of the document is wide.

  - Repetitive pages. An 18-page capture is often 3 interesting pages and 15
    near-identical grids. Ask before handing over the lot; --pages=1-3,-2--1 is
    also ~3x faster and a quarter the size, since skipped pages are never
    captured.

  - File size. HTML output is images: 10-20 MB is normal, doubled at
    --scroll 0.5. Suggest --quality 80 --scale 1.5 before generating if the PDF
    will be emailed or committed.

  - Badly placed cuts. --cut smart moves each cut to an element boundary;
    --scroll 0.5 instead guarantees everything appears whole on some page.

  - A project logo. If the repo has one (public/logo/, assets/, static/),
    --logo makes the PDF identifiable among documents from other projects.
    Worth offering for anything the user will keep rather than read once.

  Practicalities that will otherwise bite you:

  - Give it time. A large HTML page takes minutes — it loads the page, scrolls
    it to trigger lazy images, then captures every slice. Set a generous
    timeout; a "hang" is usually just work. Don't retry blindly.

  - HTML with remote assets needs network. Mockups pulling a CDN Tailwind,
    Google Fonts or remote images render blank or unstyled offline.

  - Check line ranges against the file, don't trust a number you were given.
    Read the section's heading line and the next heading's, and end one line
    before it. Off-by-a-few silently clips the last paragraph of the section.

  Always read the summary line — it is the only success signal. "0/3 diagrams"
  means Mermaid failed and the PDF contains red error text. Then open the result
  and check the pages you deliberately changed before reporting success.

Run \`pjx-pdf --readme\` for the full documentation.
`.trimStart();

/* ------------------------------------------------------------- markdown -- */

/** Fences we hand off to Mermaid instead of the syntax highlighter. */
const MERMAID_LANGS = new Set(['mermaid']);

function createRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(code, lang) {
      if (MERMAID_LANGS.has(lang)) return null; // handled by the fence rule below
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch {
          /* fall through to escaped plain text */
        }
      }
      return null;
    },
  });

  // TeX is typeset here, in Node, exactly like highlight.js colours code: the HTML that
  // reaches Puppeteer is already final. Nothing to await in the page, so math cannot race
  // `page.pdf()` the way Mermaid can.
  md.use(katexPlugin.default ?? katexPlugin, {
    throwOnError: false, // a bad formula prints in red; the run still succeeds
    strict: false, // tolerate Unicode and other things a browser can render fine
    enableFencedBlocks: true, // ```math fences, mirroring ```mermaid
    trust: false,
  });

  md.use(attrs);
  md.use(taskLists, { label: true });
  md.use(anchor, {
    permalink: false,
    tabIndex: false,
    slugify: (s) => s.toLowerCase().replace(/[^\w]+/g, '-'),
  });

  // Mermaid fences become placeholders carrying their source; filled in-page later.
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0];
    if (MERMAID_LANGS.has(lang)) {
      const encoded = Buffer.from(token.content, 'utf8').toString('base64');
      return `<figure class="mermaid not-prose my-8 flex justify-center" data-mermaid="${encoded}"></figure>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  return md;
}

/**
 * Parse `--horizontal` specs into a map of absolute path → line ranges.
 *
 * Accepts `file.md:32-50`, a single line `file.md:32`, comma-separated groups, and a
 * leading `@` (Claude Code's file-reference syntax) which is simply stripped. Line numbers
 * are 1-indexed and refer to the file as you see it in an editor — front-matter included.
 */
function parseHorizontal(specs) {
  const ranges = new Map();

  for (const entry of specs.flatMap((s) => s.split(','))) {
    const spec = entry.trim().replace(/^@/, '');
    if (!spec) continue;

    const split = spec.lastIndexOf(':');
    if (split < 1) {
      throw new UsageError(`--horizontal needs FILE:START-END, got "${spec}"`);
    }

    const file = path.resolve(spec.slice(0, split));
    const match = /^(\d+)(?:-(\d+))?$/.exec(spec.slice(split + 1));
    if (!match) {
      throw new UsageError(`--horizontal line range must be START-END, got "${spec}"`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (end < start) {
      throw new UsageError(`--horizontal range ends before it starts: "${spec}"`);
    }

    ranges.set(file, [...(ranges.get(file) ?? []), [start, end]]);
  }

  return ranges;
}

/** How many leading lines gray-matter consumed, so editor line numbers still line up. */
function frontMatterOffset(source) {
  const lines = source.split('\n');
  if (!/^---\s*$/.test(lines[0] ?? '')) return 0;
  const close = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line));
  return close > 0 ? close + 1 : 0;
}

/**
 * Split one document into alternating normal / landscape blocks.
 *
 * Each block is rendered independently, so a range must not cut through a single Markdown
 * construct — pick section boundaries, which is what the line numbers are for.
 */
function splitBlocks(doc, ranges, md) {
  if (!ranges?.length) return [{ html: md.render(doc.content), landscape: false }];

  const offset = frontMatterOffset(doc.source);
  const lines = doc.content.split('\n');
  const isLandscape = new Array(lines.length).fill(false);

  for (const [start, end] of ranges) {
    for (let n = start; n <= end; n++) {
      const index = n - 1 - offset; // editor 1-indexed → content 0-indexed
      if (index >= 0 && index < lines.length) isLandscape[index] = true;
    }
  }

  const blocks = [];
  let runStart = 0;
  for (let i = 1; i <= lines.length; i++) {
    if (i < lines.length && isLandscape[i] === isLandscape[runStart]) continue;
    const text = lines.slice(runStart, i).join('\n');
    if (text.trim()) blocks.push({ html: md.render(text), landscape: isLandscape[runStart] });
    runStart = i;
  }

  return blocks;
}

/**
 * Page geometry as CSS, so one document can mix orientations — a single `page.pdf()` call
 * has one page size, but Chrome honours named `@page` rules under `preferCSSPageSize`.
 */
function pageCss(data, orientation) {
  const margin = data.margin ?? { top: '1.6cm', right: '1.4cm', bottom: '1.6cm', left: '1.4cm' };
  const box = `${margin.top} ${margin.right} ${margin.bottom} ${margin.left}`;
  const format = data.format ?? 'A4';
  const base = orientation === 'landscape' ? 'landscape' : 'portrait';

  return `
@page { size: ${format} ${base}; margin: ${box}; }
@page pjx-pdf-landscape { size: ${format} landscape; margin: ${box}; }
.pjx-pdf-landscape {
  page: pjx-pdf-landscape;
  break-before: page;
  break-after: page;
}`;
}

function buildToc(html) {
  // Attribute order/extras vary (markdown-it-attrs classes, anchor's tabindex), so match loosely.
  const headings = [...html.matchAll(/<h([23])\s[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)];
  if (!headings.length) return '';
  const items = headings
    .map(([, level, id, text]) => {
      const indent = level === '3' ? ' style="margin-left:1.2em;color:#444"' : '';
      const label = text.replace(/<[^>]+>/g, '');
      return `<li${indent}><a href="#${id}" style="text-decoration:none">${label}</a></li>`;
    })
    .join('\n');
  return `<nav class="toc" style="margin:0 0 2.4em;padding:1.1em 1.3em;border:1px solid #cfcfca;background:#f5f5f3;break-inside:avoid;">
  <p style="margin:0 0 .6em;font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#444;">Contents</p>
  <ul style="list-style:none;padding:0;margin:0;font-size:.92em;line-height:1.75;">${items}</ul>
</nav>`;
}

/** YAML parses bare dates into Date objects; render them as plain ISO days, not JS toString(). */
function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function coverHeader(data) {
  if (!data.title) return '';
  const meta = [data.author, formatDate(data.date)].filter(Boolean).join(' · ');
  return `<header style="margin:0 0 2.4em;padding-bottom:.6em;border-bottom:2px solid #000;">
  <p style="margin:0;font-size:2em;font-weight:700;letter-spacing:-.01em;line-height:1.2;color:#000;">${data.title}</p>
  ${data.subtitle ? `<p style="margin:.35em 0 0;font-size:1.15em;color:#444;">${data.subtitle}</p>` : ''}
  ${meta ? `<p style="margin:.8em 0 0;font-size:.85em;color:#666;">${meta}</p>` : ''}
</header>`;
}

/* ------------------------------------------------------------------ css -- */

/**
 * Compile Tailwind against the generated HTML. Runs the v4 CLI in a temp dir so
 * `@source` picks up exactly the classes this document uses.
 */
async function compileCss(htmlPath, extraCssFiles) {
  // The temp dir lives inside the tool so `@import "tailwindcss"` and `@plugin`
  // resolve against our own node_modules.
  const tmp = await fs.mkdtemp(path.join(here, '.build-'));
  const entry = path.join(tmp, 'entry.css');

  const extra = (
    await Promise.all(extraCssFiles.map((f) => fs.readFile(path.resolve(f), 'utf8')))
  ).join('\n\n');

  const base = await fs.readFile(path.join(here, 'theme.css'), 'utf8');

  await fs.writeFile(
    entry,
    [
      `@import "tailwindcss";`,
      `@plugin "@tailwindcss/typography";`,
      `@source "${htmlPath}";`,
      base,
      extra,
    ].join('\n'),
  );

  const cli = path.join(here, 'node_modules/.bin/tailwindcss');
  const outFile = path.join(tmp, 'out.css');
  try {
    await execFileAsync(cli, ['-i', entry, '-o', outFile], { cwd: here });
    return await fs.readFile(outFile, 'utf8');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** Does this document actually contain typeset math? */
function hasMath(html) {
  return html.includes('class="katex');
}

/**
 * KaTeX's stylesheet, with its font faces inlined as base64 data URIs.
 *
 * The document is handed to Puppeteer with `setContent`, so it runs on an `about:blank`
 * origin that cannot read `file://` subresources — KaTeX's relative `url(fonts/…)` would
 * silently fall back to a system font and every formula would come out wrong. Same reason
 * `loadLogo()` inlines its image. Only the `woff2` face of each font is kept; Chrome never
 * reaches for the `woff`/`ttf` fallbacks and dropping them halves the payload.
 *
 * Cached because `--watch` re-renders in the same process.
 */
let katexCssCache;
async function katexCss() {
  if (katexCssCache !== undefined) return katexCssCache;

  const dist = path.join(here, 'node_modules/katex/dist');
  const css = await fs.readFile(path.join(dist, 'katex.min.css'), 'utf8');

  const names = [...new Set([...css.matchAll(/url\(fonts\/([\w-]+\.woff2)\)/g)].map((m) => m[1]))];
  const encoded = new Map(
    await Promise.all(
      names.map(async (name) => [
        name,
        (await fs.readFile(path.join(dist, 'fonts', name))).toString('base64'),
      ]),
    ),
  );

  katexCssCache = css.replace(/src:[^;}]+/g, (src) => {
    const woff2 = /url\(fonts\/([\w-]+\.woff2)\)/.exec(src);
    if (!woff2) return src;
    return `src:url(data:font/woff2;base64,${encoded.get(woff2[1])}) format("woff2")`;
  });
  return katexCssCache;
}

/* ----------------------------------------------------------------- html -- */

function wrapDocument({ body, title, pageRules }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>__PJX_PDF_MATH_CSS__</style>
<style>__PJX_PDF_CSS__</style>
<style>${pageRules}</style>
</head>
<body class="bg-white">
<article class="doc">
${body}
</article>
</body>
</html>`;
}

/* ------------------------------------------------------------ html deck -- */

/**
 * Viewport presets for HTML mode. Heights are derived from the A4 aspect ratio rather
 * than from real device heights, so each captured slice fills a page edge to edge with
 * no letterboxing. Widths are the real breakpoints that decide which layout renders.
 */
const VIEW_PRESETS = {
  desktop: { width: 1728, orientation: 'landscape' },
  laptop: { width: 1440, orientation: 'landscape' },
  tablet: { width: 834, orientation: 'portrait' },
  phone: { width: 390, orientation: 'portrait' },
};

const A4_LONG_MM = 297;
const A4_SHORT_MM = 210;

/** Resolve `--view` into a viewport size plus the page geometry that matches it. */
function resolveView(spec, orientation) {
  const custom = /^(\d+)x(\d+)$/.exec(spec);

  if (custom) {
    const width = Number(custom[1]);
    const height = Number(custom[2]);
    // Scale the page so its long side is A4's long side, preserving the viewport ratio.
    const [pageW, pageH] =
      width >= height
        ? [A4_LONG_MM, (A4_LONG_MM * height) / width]
        : [(A4_LONG_MM * width) / height, A4_LONG_MM];
    return { width, height, pageW, pageH, label: `${width}×${height}` };
  }

  const preset = VIEW_PRESETS[spec];
  if (!preset) {
    throw new UsageError(
      `--view must be one of ${Object.keys(VIEW_PRESETS).join(', ')} or WIDTHxHEIGHT, got "${spec}"`,
    );
  }

  // An explicit --landscape/--portrait overrides the preset's default paper orientation,
  // keeping its width — so the same layout is captured onto differently shaped pages.
  const landscape = (orientation ?? preset.orientation) === 'landscape';
  const pageW = landscape ? A4_LONG_MM : A4_SHORT_MM;
  const pageH = landscape ? A4_SHORT_MM : A4_LONG_MM;
  const height = Math.round((preset.width * pageH) / pageW);

  return { width: preset.width, height, pageW, pageH, label: `${spec} ${preset.width}×${height}` };
}

/**
 * Choose where to cut a page of height `viewH`.
 *
 * `viewport` advances by `scroll` × the viewport height between captures, exactly as if
 * you scrolled that far and took a screenshot. At the default 1 the pages tile the
 * document with no overlap; at 0.5 each page repeats the lower half of the one before it,
 * so nothing that straddles a cut is ever seen only in halves.
 *
 * `smart` ignores `scroll` and instead pulls each cut back to the nearest element
 * boundary, so cards and sections aren't sliced through — at the cost of whitespace at
 * the bottom of the page.
 */
async function planCuts(page, totalHeight, viewH, mode, scroll) {
  if (mode === 'viewport') {
    const step = Math.max(1, Math.round(viewH * scroll));
    const cuts = [];
    for (let y = 0; y < totalHeight; y += step) {
      cuts.push({ y, height: Math.min(viewH, totalHeight - y) });
      if (y + viewH >= totalHeight) break; // the bottom is on screen; further steps repeat it
    }
    return cuts;
  }

  const boundaries = await page.evaluate(() => {
    // Bottom edges of structural blocks make the least jarring cut points.
    const selector = 'body > *, section, header, footer, main > *, [class*="section"]';
    const ys = new Set([0]);
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) ys.add(Math.round(rect.bottom + window.scrollY));
    }
    return [...ys].sort((a, b) => a - b);
  });

  const cuts = [];
  let y = 0;
  while (y < totalHeight) {
    const limit = y + viewH;
    if (limit >= totalHeight) {
      cuts.push({ y, height: totalHeight - y });
      break;
    }
    // Only accept a boundary that fills at least 60% of the page, else we waste paper.
    const candidate = boundaries.filter((b) => b > y + viewH * 0.6 && b <= limit).pop();
    const next = candidate ?? limit;
    cuts.push({ y, height: next - y });
    y = next;
  }
  return cuts;
}

/**
 * Resolve a `--pages` spec against a known page count, into a set of 1-indexed pages.
 *
 * Tokens are comma-separated: `3` a single page, `1-3` a range, and negative indices count
 * from the end, so `-1` is the last page and `-1--2` is the last two. Out-of-range numbers
 * are clamped rather than rejected — the kept/total count is reported so it stays visible.
 * Returns null when no spec was given, meaning "keep everything".
 */
function selectPages(spec, total) {
  if (!spec) return null;

  const resolve = (n) => {
    const abs = n < 0 ? total + 1 + n : n;
    return Math.min(total, Math.max(1, abs));
  };

  const keep = new Set();
  for (const token of spec.split(',')) {
    const text = token.trim();
    if (!text) continue;

    const match = /^(-?\d+)(?:-(-?\d+))?$/.exec(text);
    if (!match || Number(match[1]) === 0) {
      throw new UsageError(`--pages token must be N, A-B, or a negative index, got "${text}"`);
    }

    const a = resolve(Number(match[1]));
    const b = match[2] === undefined ? a : resolve(Number(match[2]));
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) keep.add(n);
  }

  if (keep.size === 0) throw new UsageError('--pages selected no pages');
  return keep;
}

/**
 * Load a page, settle it, and work out where it would be cut — without capturing anything
 * yet, so `--pages` can discard slices before they cost a screenshot.
 */
async function preparePage(browser, file, view, opts) {
  const page = await browser.newPage();
  await page.setViewport({
    width: view.width,
    height: view.height,
    deviceScaleFactor: opts.scale,
  });

  await page.goto(`file://${file}`, { waitUntil: 'networkidle0', timeout: 120000 });

  // Scroll the whole document to trigger lazy-loaded images, then return to the top so
  // sticky/fixed elements are captured where they belong.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let y = 0;
        const step = () => {
          y += window.innerHeight;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) setTimeout(step, 40);
          else {
            window.scrollTo(0, 0);
            setTimeout(resolve, 300);
          }
        };
        step();
      }),
  );

  // Freeze animations so a slice can't catch a transition mid-flight.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-play-state: paused !important;
      transition: none !important;
    }`,
  });

  await page.evaluate(() => document.fonts.ready);

  const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const cuts = await planCuts(page, totalHeight, view.height, opts.cut, opts.scroll);

  return { page, cuts, totalHeight };
}

/** Capture one planned cut to disk and return its filename. */
async function captureSlice(page, cut, view, opts, dir, index) {
  const name = `slice-${String(index).padStart(4, '0')}.${opts.png ? 'png' : 'jpeg'}`;
  await page.screenshot({
    path: path.join(dir, name),
    clip: { x: 0, y: cut.y, width: view.width, height: cut.height },
    captureBeyondViewport: true,
    ...(opts.png ? { type: 'png' } : { type: 'jpeg', quality: opts.quality }),
  });
  return name;
}

/**
 * HTML mode: render each input at a device viewport, cut the long page into
 * screen-sized slices, and lay those out one per PDF page.
 */
async function buildHtmlDeck(opts) {
  const inputPaths = opts.inputs.map((p) => path.resolve(p));
  const view = resolveView(opts.view, opts.orientation);

  const outPath = resolveOutPath(opts, inputPaths, '.html');
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pjx-pdf-shots-'));
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });

  try {
    // Plan every page first: --pages is resolved against the full count (so negative
    // indices mean what they say), and discarded slices never cost a screenshot.
    const prepared = [];
    for (const file of inputPaths) {
      prepared.push(await preparePage(browser, file, view, opts));
    }

    const totalPages = prepared.reduce((sum, doc) => sum + doc.cuts.length, 0);
    const keep = selectPages(opts.pages, totalPages);

    const names = [];
    let pageNumber = 0;
    for (const doc of prepared) {
      for (const cut of doc.cuts) {
        pageNumber++;
        if (!keep || keep.has(pageNumber)) {
          names.push(await captureSlice(doc.page, cut, view, opts, dir, pageNumber));
        }
      }
      await doc.page.close();
    }

    // Slices are referenced relative to a shell page loaded from the same directory —
    // setContent() runs on an about:blank origin that cannot read file:// subresources.
    const body = names.map((name) => `<div class="pg"><img src="${name}" alt=""></div>`).join('\n');

    const shellPath = path.join(dir, 'shell.html');
    await fs.writeFile(
      shellPath,
      `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  .pg {
    width: ${view.pageW}mm;
    height: ${view.pageH}mm;
    overflow: hidden;
    break-after: page;
  }
  .pg:last-child { break-after: auto; }
  /* Slices shorter than a full view (smart cuts) sit at the top, whitespace below. */
  .pg img { width: ${view.pageW}mm; display: block; }
</style>
<body>${body}</body>`,
    );

    const shell = await browser.newPage();
    await shell.goto(`file://${shellPath}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await shell.pdf({
      path: outPath,
      width: `${view.pageW}mm`,
      height: `${view.pageH}mm`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const { size } = await fs.stat(outPath);
    const relative = path.relative(process.cwd(), outPath);
    const shown = relative.startsWith('..') ? outPath : relative;

    const pageCount = keep ? `${names.length} of ${totalPages} pages` : `${totalPages} pages`;
    const parts = [`${(size / 1024 / 1024).toFixed(1)} MB`, pageCount, view.label];
    if (inputPaths.length > 1) parts.splice(1, 0, `${inputPaths.length} files`);

    console.log(`✓ ${shown}  (${parts.join(', ')})`);
    if (opts.open) await execFileAsync('open', [outPath]);
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ pdf -- */

const CHROME_STYLE =
  'font-size:8px;color:#777;width:100%;padding:0 1.4cm;font-family:Charter,Georgia,serif;';

const LOGO_MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/** CSS length → millimetres, for comparing the logo against the margin it has to fit in. */
function toMm(value) {
  const match = /^([\d.]+)\s*(mm|cm|in|px|pt)?$/.exec(String(value).trim());
  if (!match) return null;
  const factor = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 96, pt: 25.4 / 72 };
  return Number(match[1]) * (factor[match[2] ?? 'px'] ?? 1);
}

/**
 * Inline the logo as a data URI.
 *
 * Header/footer templates render in an isolated context that does not fetch external
 * resources, so a file path or URL silently renders nothing — the image must be embedded.
 */
async function loadLogo(file, height, margin) {
  const ext = path.extname(file).toLowerCase();
  const mime = LOGO_MIME[ext];
  if (!mime) {
    throw new UsageError(
      `--logo must be one of ${Object.keys(LOGO_MIME).join(', ')}, got "${ext || file}"`,
    );
  }

  const heightMm = toMm(height);
  if (heightMm === null) throw new UsageError(`--logo-height must be a CSS length, got "${height}"`);

  // The footer is drawn inside the bottom margin, so a taller logo would just be clipped.
  const marginMm = toMm(margin.bottom ?? '1.6cm');
  if (marginMm !== null && heightMm > marginMm - 3) {
    throw new UsageError(
      `--logo-height ${height} does not fit the ${margin.bottom ?? '1.6cm'} bottom margin; ` +
        `use at most ${(marginMm - 3).toFixed(0)}mm or increase the margin in front-matter`,
    );
  }

  let data;
  try {
    data = await fs.readFile(path.resolve(file));
  } catch {
    throw new UsageError(`No such file: ${file}`);
  }

  return `<img src="data:${mime};base64,${data.toString('base64')}"
    style="height:${height};max-height:${height};width:auto;max-width:45mm;opacity:.75">`;
}

/** Expand a page-number template into Puppeteer's magic header/footer spans. */
function pageNumberHtml(format) {
  return format
    .replaceAll('{page}', '<span class="pageNumber"></span>')
    .replaceAll('{total}', '<span class="totalPages"></span>');
}

/**
 * Work out the running header/footer. CLI flags beat front-matter, which beats the
 * default of "numbers on". An explicit `footer` in front-matter replaces the lot,
 * logo included.
 */
function resolveChrome(data, opts, logo) {
  const wantsNumbers = opts.pageNumbers ?? data.pageNumbers ?? true;
  const format = opts.pageNumberFormat ?? data.pageNumberFormat ?? '{page} / {total}';

  const header = data.header ?? (data.title ? `<div style="${CHROME_STYLE}">${data.title}</div>` : '');

  // Logo bottom-left, page numbers bottom-right, on one baseline.
  const built =
    logo || wantsNumbers
      ? `<div style="${CHROME_STYLE}display:flex;align-items:center;justify-content:space-between;">
           <span style="display:flex;align-items:center;">${logo ?? ''}</span>
           <span>${wantsNumbers ? pageNumberHtml(format) : ''}</span>
         </div>`
      : '';

  const footer = data.footer ?? built;

  return { header, footer, enabled: Boolean(header || footer) };
}

async function renderPdf({ html, outPath, data, theme, chrome }) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.addScriptTag({ path: path.join(here, 'node_modules/mermaid/dist/mermaid.min.js') });

    // Render every diagram and *await* completion — this is the step md-to-pdf races on.
    const diagrams = await page.evaluate(async (mermaidTheme) => {
      // eslint-disable-next-line no-undef
      mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        fontFamily: 'ui-sans-serif, -apple-system, Segoe UI, sans-serif',
        flowchart: { useMaxWidth: true, htmlLabels: true },
        sequence: { useMaxWidth: true },
      });

      const nodes = [...document.querySelectorAll('figure.mermaid[data-mermaid]')];
      let rendered = 0;
      for (const [i, node] of nodes.entries()) {
        const source = new TextDecoder().decode(
          Uint8Array.from(atob(node.dataset.mermaid), (c) => c.charCodeAt(0)),
        );
        try {
          // eslint-disable-next-line no-undef
          const { svg } = await mermaid.render(`mmd-${i}`, source);
          node.innerHTML = svg;
          rendered++;
        } catch (err) {
          node.innerHTML = `<pre class="text-red-600 text-xs whitespace-pre-wrap">Mermaid error: ${err.message}</pre>`;
        }
      }
      return { total: nodes.length, rendered };
    }, theme);

    // Let the browser settle layout/fonts before snapshotting.
    await page.evaluate(() => document.fonts.ready);

    await page.pdf({
      path: outPath,
      printBackground: true,
      // Size, orientation and margins all come from the @page rules in pageCss(). That is
      // the only way one PDF can mix portrait and landscape pages — passing format/margin
      // here would apply a single geometry to every page and defeat `--horizontal`.
      preferCSSPageSize: true,
      displayHeaderFooter: chrome.enabled,
      // Puppeteer falls back to its own date/title chrome if a template is empty,
      // so pass an empty div rather than an empty string.
      headerTemplate: chrome.header || '<div></div>',
      footerTemplate: chrome.footer || '<div></div>',
    });

    return diagrams;
  } finally {
    await browser.close();
  }
}

/* ----------------------------------------------------------------- main -- */

/**
 * Where the PDF lands. `--out` may be a full path or a bare filename; `--out-dir` sets the
 * directory for either that filename or the derived default. Both are optional.
 */
function resolveOutPath(opts, inputPaths, ext = '.md') {
  const pattern = ext === '.html' ? /\.html?$/i : /\.mdx?$/i;
  const fallbackName = `${path.basename(inputPaths[0], path.extname(inputPaths[0]))}.pdf`;
  const name = opts.out ?? (opts.outDir ? fallbackName : inputPaths[0].replace(pattern, '.pdf'));

  // An absolute --out wins outright; otherwise --out-dir (or cwd) provides the directory.
  if (path.isAbsolute(name)) return name;
  return path.resolve(opts.outDir ?? '.', name);
}

async function build(opts) {
  const inputPaths = opts.inputs.map((p) => path.resolve(p));

  const docs = await Promise.all(
    inputPaths.map(async (file) => {
      const source = await fs.readFile(file, 'utf8');
      return { file, source, ...matter(source) };
    }),
  );

  // Document-level config is merged first-file-wins; the cover comes from the first only.
  const data = docs.reduce((merged, doc) => ({ ...doc.data, ...merged }), {});

  const horizontal = parseHorizontal(opts.horizontal);
  for (const file of horizontal.keys()) {
    if (!inputPaths.includes(file)) {
      throw new UsageError(`--horizontal names a file that is not an input: ${file}`);
    }
  }

  const md = createRenderer();
  const sections = [];
  let landscapeBlocks = 0;

  docs.forEach((doc, i) => {
    if (i > 0 && opts.join !== 'flow') sections.push('<div class="break-before-page"></div>');
    for (const block of splitBlocks(doc, horizontal.get(doc.file), md)) {
      if (block.landscape) landscapeBlocks++;
      sections.push(
        block.landscape ? `<section class="pjx-pdf-landscape">${block.html}</section>` : block.html,
      );
    }
  });

  let body = sections.join('\n');

  if (data.toc) body = buildToc(body) + body;
  body = coverHeader(data) + body;

  const title = data.title ?? path.basename(inputPaths[0], path.extname(inputPaths[0]));
  const outPath = resolveOutPath(opts, inputPaths);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const htmlPath = outPath.replace(/\.pdf$/i, '.html');

  // Tailwind needs the markup on disk to scan for class names. Both stylesheets stay empty
  // for that pass — a few hundred KB of inlined font data is nothing but candidate noise.
  const orientation = opts.orientation ?? (data.landscape ? 'landscape' : 'portrait');
  const shell = wrapDocument({ body, title, pageRules: pageCss(data, orientation) });
  await fs.writeFile(
    htmlPath,
    shell.replace('__PJX_PDF_MATH_CSS__', '').replace('__PJX_PDF_CSS__', ''),
  );

  const css = await compileCss(htmlPath, opts.css);
  // KaTeX's stylesheet is only paid for by documents that use it.
  const math = hasMath(body) ? await katexCss() : '';
  const html = shell
    .replace('__PJX_PDF_MATH_CSS__', () => math)
    .replace('__PJX_PDF_CSS__', () => css);

  if (opts.html) await fs.writeFile(htmlPath, html);
  else await fs.rm(htmlPath, { force: true });

  const logoFile = opts.logo ?? data.logo;
  const logo = logoFile
    ? await loadLogo(
        logoFile,
        opts.logoHeight ?? data.logoHeight ?? '8mm',
        data.margin ?? { bottom: '1.6cm' },
      )
    : null;

  const chrome = resolveChrome(data, opts, logo);
  const stats = await renderPdf({ html, outPath, data, theme: opts.theme, chrome });
  const { size } = await fs.stat(outPath);

  // Formulas are typeset during `md.render()`, so they are counted off the markup rather
  // than reported back by the browser the way diagrams are.
  const formulas = (body.match(/<span class="katex"/g) ?? []).length;
  const badFormulas = (body.match(/class="katex-error"/g) ?? []).length;

  const parts = [`${(size / 1024).toFixed(0)} KB`];
  if (docs.length > 1) parts.push(`${docs.length} files`);
  if (stats.total) parts.push(`${stats.rendered}/${stats.total} diagrams`);
  if (formulas || badFormulas) parts.push(`${formulas}/${formulas + badFormulas} formulas`);
  if (landscapeBlocks) parts.push(`${landscapeBlocks} landscape`);

  // Prefer the relative path, unless climbing out of cwd makes it the longer one.
  const relative = path.relative(process.cwd(), outPath);
  const shown = relative.startsWith('..') ? outPath : relative;

  console.log(`✓ ${shown}  (${parts.join(', ')})`);

  if (opts.open) await execFileAsync('open', [outPath]);
}

/** Debounced rebuild shared by every watcher, so a multi-file save triggers one run. */
function createRebuilder(opts) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      build(opts).catch((err) => console.error(`✗ ${err.message}`));
    }, 150);
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.readme) {
    console.log(await fs.readFile(path.join(here, 'README.md'), 'utf8'));
    return;
  }

  if (opts.help || opts.inputs.length === 0) {
    console.log(USAGE);
    // Asking for help succeeded. Being invoked with nothing to do did not — that is the
    // case a script wants to catch.
    process.exit(opts.help ? 0 : 1);
  }

  if (opts.inputs.length > 1 && !opts.out && !opts.outDir) {
    // Defaulting to the first input's name would silently overwrite one of the sources'
    // siblings; make the caller name the combined output.
    throw new UsageError(
      '-o/--out (or -d/--out-dir) is required when combining multiple input files',
    );
  }

  if (!['page', 'flow'].includes(opts.join)) {
    throw new UsageError(`--join must be "page" or "flow", got "${opts.join}"`);
  }

  // Check up front: HTML mode reaches the filesystem through the browser, which reports a
  // missing file as an opaque navigation failure rather than ENOENT.
  for (const input of opts.inputs) {
    try {
      await fs.access(path.resolve(input));
    } catch {
      throw new UsageError(`No such file: ${input}`);
    }
  }

  const isHtml = (f) => /\.html?$/i.test(f);
  const htmlCount = opts.inputs.filter(isHtml).length;

  if (htmlCount > 0 && htmlCount < opts.inputs.length) {
    // The two modes produce different page geometries, and one PDF has one page size.
    throw new UsageError('cannot mix HTML and Markdown inputs in a single PDF');
  }

  if (htmlCount > 0) {
    if (opts.logo) {
      throw new UsageError(
        '--logo applies to Markdown mode; HTML pages are full-bleed screenshots with no footer',
      );
    }
    if (!['viewport', 'smart'].includes(opts.cut)) {
      throw new UsageError(`--cut must be "viewport" or "smart", got "${opts.cut}"`);
    }
    if (!(opts.scroll > 0 && opts.scroll <= 1)) {
      throw new UsageError(`--scroll must be greater than 0 and at most 1, got "${opts.scroll}"`);
    }
    await buildHtmlDeck(opts);
  } else {
    await build(opts);
  }

  if (opts.watch) {
    console.log(`watching ${opts.inputs.length} file(s) …`);
    const rebuild = createRebuilder(opts);
    await Promise.all(
      opts.inputs.map(async (input) => {
        for await (const _event of fs.watch(path.resolve(input))) rebuild();
      }),
    );
  }
}

main().catch((err) => {
  if (err instanceof UsageError) {
    console.error(`✗ ${err.message}\n\nRun pjx-pdf --help for usage.`);
  } else if (err.code === 'ENOENT' && err.path) {
    console.error(`✗ No such file: ${err.path}`);
  } else {
    console.error(`✗ ${err.stack ?? err.message}`);
  }
  process.exit(1);
});

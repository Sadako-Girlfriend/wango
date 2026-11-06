# Changelog

All notable user-facing changes are listed here.  
Format inspired by [Keep a Changelog](https://keepachangelog.com/).  
版本号与 `package.json` / `src-tauri/tauri.conf.json` 一致。

## 0.5.0 — 2026-11-07

### Added
- Editor toolbar: align left / center / right (paragraph & heading)

## 0.4.19 — 2026-11-07

### Fixed
- Inline math empty hint: participates in layout when selected/focused so the full prompt fits on one line

### Changed
- Inline math: tight when idle; roomy when editing; empty idle is a small chip without the long hint

## 0.4.18 — 2026-11-07

### Changed
- Inline math edit mode: larger padding/font; MathLive placeholders (frac slots) wider/taller

## 0.4.17 — 2026-11-07

### Changed
- Inline math: shrink when idle; expand padding on node select; × only while the math field is focused

## 0.4.16 — 2026-11-07

### Fixed
- Inline math delete (×): hidden on hover; only shown when the formula is selected

## 0.4.15 — 2026-11-06

### Fixed
- Inline math: content width, adaptive height (fractions fully visible), vertical middle vs neighbors; paragraphs/export no longer clip

## 0.4.14 — 2026-11-06

### Fixed
- Inline math font size bumped (~1.18em) so exponents stay readable without reintroducing wide gaps

## 0.4.13 — 2026-11-06

### Fixed
- Inline math no longer leaves huge gaps (dropped fixed 10em/14em min-width; baseline align)
- Proposal summary sits at the bottom of the card (after actions)

## 0.4.12 — 2026-11-06

### Fixed
- Agent thinking stream no longer freezes the UI (rAF-batched deltas; App stops re-rendering editor on every token)

## 0.4.11 — 2026-11-06

### Fixed
- Proposal summary moved below preview body
- PDF/editor: GFM tables no longer flatten into one line; math nodes included in long-PDF render

## 0.4.10 — 2026-11-06

### Fixed
- Settings → About showed stale `0.3.39`; now reads `package.json` version

## 0.4.9 — 2026-11-06

### Fixed
- Bare TeX (`\frac` / `\times` without `$`) converted to math nodes on apply
### Added
- Agent proposal cards always show a short summary (`note` or client fallback)

## 0.4.8 — 2026-11-06

### Changed
- Diff marks: background only (no border); adjacent same-type blocks coalesce
### Added
- Agent: right-click user message → Edit & resend

## 0.4.7 — 2026-11-06

### Added
- Agent: pending content proposals show red/green diff in the editor body (read-only preview)
### Changed
- Apply writes final content and clears body diff; Skip restores original

## 0.4.6 — 2026-11-06

### Added
- Agent proposal cards: red/green paragraph diff vs current content before Apply
### Changed
- After Apply/Skip, proposal preview shows clean final text (diff colors go away)

## 0.4.5 — 2026-11-06

### Fixed
- Agent Apply left struck-through old text: Strike stole `<del>` from DiffDel; markers now use `div`
### Changed
- Agent Apply writes final content (no lingering delete marks); wand still uses red/green + Accept

## 0.4.4 — 2026-11-06

### Added
- Agent: optional DeepSeek web Search (off by default); toggle in Settings / Agent header

## 0.4.3 — 2026-11-06

### Added
- AI content edits: paragraph-level green (add) / red (delete) marks; toolbar「接受改动」
### Changed
- Agent proposals: forbid nested ``` in next/content; sanitize fences to `<pre>`; per-proposal apply try/catch

## 0.4.2 — 2026-11-06

### Fixed
- Agent: parse wango-proposals even when JSON strings contain nested ``` (Apply buttons were missing)

## 0.4.1 — 2026-11-06

### Fixed
- Agent: wheel scroll stolen by editor behind overlay; stop auto-scroll after reply so Apply stays reachable
### Changed
- Agent: prompt requires wango-proposals whenever concrete node content is proposed

## 0.4.0 — 2026-11-06

### Added
- AI (inspire / agent / wand): emit math-block / math-inline HTML; convert `$` / `$$` into formula nodes on apply

## 0.3.60 — 2026-11-06

### Fixed
- Formula: export without editor chrome (border/background/label); empty inline field no longer collapses into a skinny tower

## 0.3.59 — 2026-11-06

### Changed
- Formula: larger inline math chrome; hide MathLive menu/keyboard toggles (use palette + right-click)

## 0.3.58 — 2026-11-06

### Added
- Formula: insert inline when the current paragraph already has text; empty paragraph still gets a block formula

## 0.3.57 — 2026-11-06

### Fixed
- Formula: Chinese labels for MathLive Insert submenu (absolute value, calculus, complex numbers, etc.)

## 0.3.56 — 2026-11-06

### Fixed
- Formula: restore MathLive right-click menu (was blocked earlier); locale follows app language (`zh-cn` / `en`)

## 0.3.55 — 2026-11-06

### Changed
- Formula palette: **公式库** tab moved to the end; default tab is 常用 again

## 0.3.54 — 2026-11-06

### Added
- Formula library filters by **学段** (小学 / 初中 / 高中 / 大学 / 专业领域), matching HuiTurn/Formula

## 0.3.53 — 2026-11-06

### Changed
- Formula palette: **公式库** is the first tab (same row as 常用 / 希腊), opens on library by default

## 0.3.52 — 2026-11-06

### Added
- Formula palette **Library** tab: search + category (math / physics / chemistry / …), one-click insert (~548 formulas from HuiTurn/Formula, MIT)

## 0.3.51 — 2026-11-06

### Fixed
- Formula: clearing the last digit no longer removes the whole formula block (delete the block with × only)

## 0.3.50 — 2026-11-06

### Fixed
- Formula: Backspace can delete symbols inside MathLive again (capture-phase `stopImmediatePropagation` was blocking MathLive)
- Formula: clear `menuItems` only after the field is mounted so the English context menu actually goes away

## 0.3.49 — 2026-11-06

### Fixed
- Formula: disable MathLive’s English context menu (use the symbol panel instead)
- Formula: delete via the × button; Backspace/Delete on an empty formula removes the whole block

## 0.3.48 — 2026-11-06

### Fixed
- Formula block: typing into a placeholder no longer deletes the whole block (ProseMirror was eating keys on the atom selection)
- Keep caret inside MathLive slots; ignore MathLive DOM mutations

## 0.3.47 — 2026-11-06

### Fixed
- Formula palette: clearer **根号 / 分数** captions; templates use placeholders so they **nest** (root then fraction)
- MathLive soft keyboard stays off; structure comes from the floating panel

## 0.3.46 — 2026-11-06

### Added
- **Formula block** (MathLive): block-level editable math with fillable slots (roots, fractions, …)
- Draggable **symbol palette** (structure / Greek / operators / relations / more); click to insert into the focused formula
- Word export embeds formula blocks as images (same path as code / callout)

## 0.3.45 — 2026-11-06

### Changed
- Narrow window: when three panes cannot dock, **Agent overlays** the editor (left tree stays)

### Removed
- Auto-collapsing the left tree / temporarily hiding Agent just to free horizontal space

## 0.3.44 — 2026-11-06

### Fixed
- Header Agent toggle when the panel was squeezed: clicking no longer looked like a no-op / close-only

## 0.3.43 — 2026-11-06

### Changed
- Header: **New** menu (template / from file / from paste); **File** menu (open / save / export)

### Fixed
- Narrow header: dropdowns were clipped by `overflow-x: auto`, so New-from-template / File looked unclickable

## 0.3.42 — 2026-11-06

### Fixed
- Narrow window layout: keep a minimum main editor width; shrink side panes first
- (Superseded for Agent by 0.3.45 overlay behavior)

## 0.3.41 — 2026-11-06

### Added
- Inspiration prepare overlay: streaming **thinking** (when the gateway sends reasoning) + **Cancel** on the mask

### Fixed
- Deep models no longer feel stuck behind a full-screen overlay with no cancel / no progress

## 0.3.40 — 2026-11-06

### Fixed
- **Inspiration** post-process: split `## x.y` stuck in parent bodies into child nodes; lift chapters wrongly nested under a single「总览」; strip handwritten numbers from titles
- Stronger inspire prompts for tree shape (one section = one node; chapters as siblings)

## 0.3.39 — 2026-11-04

### Added
- **Agent** side panel — full-project chat; proposal cards (confirm before write); thinking fold-out
- Agent proposals: edit title/body, **add child** / glossary entry; **Apply all** with parent-before-child order
- Agent **chat tabs** — new chat opens a tab; export can include all tabs
- Review bar above composer (pending count · skip all · apply all), Cursor-style
- **Other projects** always available while editing (open… + recent saved files)

### Changed
- App / `.wango` file icons use transparent rounded corners

### Fixed
- Applying Agent body on the open page now refreshes the editor (same-node external sync)
- Agent chat embedded in `.wango` restores after file rename (path-key hydrate)

## 0.3.38 — 2026-11-03

### Added
- **New from paste / New from file** — build a new project from clipboard (numbers / titles / AI) or `.docx` / `.md`
- **Glossary** pane — reference or copy outline nodes as terms; links, blacklist, rename notes
- **Configurable shortcuts** — Settings → Shortcuts (record, conflict check, reset); defaults include Alt+1/2/3 focus, tree arrows, F10 stats
- **Content stats** (F10) — characters / punctuation / code / callouts by scope
- Tree **release children** / **dissolve node**
- Editor line height; cleaner Enter / paste HTML sanitize

### Changed
- Paste/file flows open a **new project tab** (not insert into the current tree)
- Settings tabs: General / AI / **Shortcuts** / About

## 0.3.37 — 2026-11-01

### Fixed
- Tree **right-click** no longer selects the node or swaps the editor body (left-click only)

### Changed
- Node **priority** moved into a context **submenu** (shorter primary menu)

## 0.3.36 — 2026-11-01

### Fixed
- Context menu placement: opens up/down from the cursor; avoids clipping at the bottom edge

## 0.3.35 — 2026-11-01

### Added
- Settings tabs: General / AI / About
- Default export directory (local setting)
- About page with product philosophy text

## 0.3.30 – 0.3.34 — 2026-11-01

### Added / improved
- Richer export flows (Markdown, PDF, mind map, content images, `.wango` copy)
- Inspiration modes and local API settings
- Tree priorities, labels, and menu polish
- Sample “Getting started” guide as built-in template data

## 0.3.0 – 0.3.29 — 2026-10-31 / 2026-11-01

### Added
- Core tree + TipTap editor + attachments
- `.wango` ZIP package format with legacy JSON open
- Multi-tab projects, home screen, recents, single-instance
- zh-CN / en UI
- Portable Windows exe via Tauri

---

For day-to-day engineering notes kept only on the maintainer machine, see the local `版本记录.md` (not published).

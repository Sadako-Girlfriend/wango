# Changelog

All notable user-facing changes are listed here.  
Format inspired by [Keep a Changelog](https://keepachangelog.com/).  
版本号与 `package.json` / `src-tauri/tauri.conf.json` 一致。

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

# Changelog

All notable user-facing changes are listed here.  
Format inspired by [Keep a Changelog](https://keepachangelog.com/).  
版本号与 `package.json` / `src-tauri/tauri.conf.json` 一致。

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

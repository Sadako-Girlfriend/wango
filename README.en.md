# WanGou · 万构

English | [简体中文](./README.md)

A **local-first** tree-structured writing & knowledge-decomposition workstation.  
Organize with a tree, write details in rich text, export for humans or AI — and optionally use OpenAI-compatible APIs for **Inspiration** generation.

Version **0.3.39** · Windows desktop (Tauri) · [Apache-2.0](./LICENSE)

<p align="center">
  <img src="docs/screenshots/02-workspace.png" alt="WanGou workspace: tree + rich text" width="900" />
</p>

---

## Why WanGou

- **Tree for structure, editor for detail** — more than short mind-map labels; clearer hierarchy than a sprawling Word doc  
- **One `.wango` file carries everything** — ZIP pack (tree + body + attachments), double-click to open  
- **Write / save / export offline** — Inspiration is optional, not a gate  
- **UI in Chinese & English** — switch in Settings  

---

## How it grows (no full blueprint required)

WanGou does **not** demand a finished outline before you start. Real use looks like this: drop the first layer of ideas, drill down, insert in the middle — structure **emerges**. When reshaping the tree is cheap, good ideas stop dying because “reordering the outline is too annoying.”

### Scenario 1: A login page (product / engineering)

1. Start tiny: `1.1 Login form`, `1.2 Login button` — a minimal skeleton.  
2. Validation appears: under `1.1`, add email/password rules; under the button, add a security check — stay inside one branch; fold the rest.  
3. Suddenly you need sign-up: **insert** `1.2 Register` between form and button; the old login button becomes `1.3`.  
4. Versus Word: auto-numbering often breaks after inserts. Versus pure bi-directional notes: “wedge this between A and B” is rarely a natural gesture.  

The same motion works for PRDs, API checklists, and module breakdowns.

### Scenario 2: A chapter beat (fiction / screenplay)

1. Create only `In danger` — no need to outline the whole volume first.  
2. Write detail under that node; add children (setting, antagonist, stakes).  
3. Inspiration hits: **insert** `Heroine intervenes` in the middle, then drag `Counterattack` after — numbering follows; prose stays attached to each node.  

### Scenario 3: One lesson plan (teaching)

1. Start with `Warm-up` → child `Ask a question`.  
2. Remember the board objective: insert it earlier; everything after renumbers.  
3. Concepts reused across lessons can live in the glossary, with in-body scan links so terms stay consistent.  

> In short: WanGou fits people whose ideas are messy, whose logic will change, and who need structure to grow while they write — not people forced into a perfect top-down design first.

After install, open the **sample guide** on the home screen and try the same insert / deepen / reorder moves yourself.

---

## Screenshots

### Home

Open a project, start empty, or learn from the sample guide. Drop a `.wango` file to open.

![Home](docs/screenshots/01-home.png)

### Workspace

Left: infinite tree (numbering, drag-and-drop, priority / labels). Right: rich text + attachments.

![Workspace](docs/screenshots/02-workspace.png)

### Rich text

Headings, colors & highlight, lists, links, images, code blocks (language / line numbers / copy), callouts.

![Rich text & code block](docs/screenshots/03-editor-rich.png)

### Tree actions

Context menu: add child, copy / paste, priority (submenu), labels, delete. Left-click selects; right-click opens the menu without swapping the editor body.

![Tree menu & priority](docs/screenshots/04-tree-menu.png)

### New from paste / file

Paste a numbered outline, or import `.docx` / `.md`, preview, then open as a new project.

| From paste | From file |
| :--- | :--- |
| ![From paste](docs/screenshots/11-paste-import.png) | ![From file](docs/screenshots/15-file-import.png) |

### Glossary

Bottom-left glossary: reference / copy outline terms, auto-scan and manual binds.

![Glossary](docs/screenshots/12-glossary.png)

### Agent (optional)

Full-project chat; edit proposals require confirm; chat tabs; Apply all above the composer.

![Agent](docs/screenshots/16-agent.png)

### Export

Markdown (for AI), PDF, mind map, content images, full `.wango` (optional Agent chat).

![Export](docs/screenshots/05-export.png)

| Mind map | Long image / PDF |
| :--- | :--- |
| ![Mind map](docs/screenshots/09-mindmap.png) | ![Long image](docs/screenshots/10-pdf-long.png) |

### Inspiration (optional)

Refine framework · Generate from one sentence · Outline only. Configure an OpenAI-compatible API in Settings; keys stay on device.

![Inspiration](docs/screenshots/06-inspire.png)

### Settings & productivity

Language, model endpoint, export folder, **shortcuts**, content stats (F10).

| Shortcuts | Content stats |
| :--- | :--- |
| ![Shortcuts](docs/screenshots/13-hotkeys.png) | ![Content stats](docs/screenshots/14-content-stats.png) |

![Settings](docs/screenshots/07-settings.png)

---

## Feature summary

| Area | Highlights |
|------|------------|
| Projects | `.wango` ZIP · open / save / save-as · multi-tab · recents · single instance |
| New | From template · **from paste** · **from file** (`.docx` / `.md`) |
| Tree | CRUD, promote / demote, drag-drop, search, priority, labels, release / dissolve |
| Glossary | Reference / copy terms · link scan · blacklist · rename notes |
| Editor | TipTap · code blocks · callouts · images · line height · attachments |
| Export | Markdown · Word · mind-map PNG · long PDF / images · `.wango` copy |
| AI | **Agent** proposals · inspiration modes · paste AI organize · keys local-only |
| Power | Configurable shortcuts · content stats (F10) · open page tabs |
| i18n | Chinese / English |

Details: [FEATURES.en.md](./FEATURES.en.md) · [中文功能说明](./功能说明.md)

---

## Quick start

### Prebuilt exe

1. Run `wango.exe` (Win10/11 usually include WebView2)  
2. If Defender warns on an unsigned build, choose **Run anyway**  
3. Open **Getting started (sample)** first  

Typical release artifact after a local build:

`src-tauri/target/release/wango.exe`

### From source

Requires **Node 18+**, **Rust**, and **VS Build Tools (C++)** on Windows.

```bash
npm install
npm test
npm run dev           # frontend only
npm run tauri:dev     # desktop
npm run tauri:build   # portable exe (no installer)
```

---

## Docs

| Doc | Description |
|-----|-------------|
| [FEATURES.en.md](./FEATURES.en.md) | Feature reference (English) |
| [功能说明.md](./功能说明.md) | Feature reference (Chinese) |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |
| [LICENSE](./LICENSE) | Apache License 2.0 |

---

## Conventions (contributors)

- `domain` / `io` / `export` must **not** depend on UI  
- Prefer Chinese code comments in this repo  
- User-facing strings live in `src/i18n` (`zh-CN` / `en` in pairs)  

---

## License

[Apache License 2.0](./LICENSE)

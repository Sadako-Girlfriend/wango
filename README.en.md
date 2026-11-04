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

## How we use it

You don’t need a finished outline up front. The left tree holds order and hierarchy; the right pane holds the detail for that node. Add nodes as you think of them; insert in the middle when something’s missing — numbers update as you go.

### Scenario 1: A login page (product / engineering)

You’re writing the “user login” slice. At first you only have two pieces:

```
1 User login
  1.1 Login form
  1.2 Login button
```

Open `1.1` and write fields in the body: email, password, “remember me”. Open `1.2` and write which API runs on click, where success goes, what failure shows.

Then validation and anti-spam show up. Hang them under the right parents; fold the rest:

```
1 User login
  1.1 Login form
    1.1.1 Email format
    1.1.2 Password rules (length / empty)
  1.2 Login button
    1.2.1 Click debounce
    1.2.2 Retry copy on failure
```

Halfway through you remember there’s no sign-up entry. Don’t reshuffle the whole page — insert a sibling between `1.1` and the old login button:

```
1 User login
  1.1 Login form
    …
  1.2 Register entry      ← newly inserted
    1.2.1 Go to register
    1.2.2 Back to login if already registered
  1.3 Login button        ← was 1.2; renumbered
    …
```

Whatever you already wrote under “Login button” stays put — no cut-and-paste. Same rhythm for PRDs, module breakdowns, and API lists: rough first, detail later, insert anytime.

### Scenario 2: A chapter beat (fiction / screenplay)

Skip outlining the whole volume. This chapter is “hero in danger” — create that node and draft the scene on the right: place, antagonist, what leverage he still has.

When the block gets long, split it:

```
3 Chapter 3
  3.1 In danger
    3.1.1 Rainy dock at night
    3.1.2 Antagonist shows the stakes
    3.1.3 Hero backed into a corner
```

You decide someone else should intervene. Insert between `3.1.2` and `3.1.3`:

```
  3.1 In danger
    3.1.1 Rainy dock at night
    3.1.2 Antagonist shows the stakes
    3.1.3 Heroine intervenes   ← new
    3.1.4 Counterattack        ← was 3.1.3
```

Each beat keeps its own body text: reorder by dragging the tree, not by tearing up a single long chapter. Recurring names and places can go in the glossary so scan-links keep wording consistent.

### Scenario 3: One lesson plan (teaching)

Take a “fraction addition” lesson. You might start with only the warm-up:

```
2 Lesson 2 — Fraction addition
  2.1 Warm-up
    2.1.1 Halves in everyday life
```

Then you remember the objective should come first, and you still need teach + practice:

```
2 Lesson 2 — Fraction addition
  2.1 Lesson goals           ← inserted at the top
  2.2 Warm-up
    2.2.1 Halves in everyday life
  2.3 New content
    2.3.1 Same-denominator add
    2.3.2 Common mistakes
  2.4 Practice & wrap-up
```

Board notes and question prompts live in each node’s body. Terms you’ll reuse next week (“same denominator”, “common denominator”) go in the glossary so you can jump back and keep the wording aligned.

After install, open the **sample guide** on the home screen and try create, nest, insert-in-between, and drag.

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

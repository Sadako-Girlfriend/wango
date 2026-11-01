# WanGou — Feature reference

> Version: **0.3.37**  
> Form factor: Windows desktop app (portable `wango.exe`, no NSIS installer)  
> 中文：[功能说明.md](./功能说明.md)

WanGou is a **local-first** tree-structured writing / knowledge-decomposition tool: organize with a tree, write details in rich text, export for people or AI, and optionally call OpenAI-compatible APIs for **Inspiration**.

---

## 1. Projects & files

### 1.1 `.wango` format
- Single **ZIP** file (similar spirit to `.docx`), extension always `.wango`
- Contains at least `project.json` (tree + body)
- Includes `attachments/` when there are images / files
- **Open** still accepts legacy pure-JSON `.wango` / `.json`
- On launch, silently registers the `.wango` file association (icon + double-click) — no installer required

### 1.2 Open & save
- Open / Save / Save as `.wango`
- Overwrite when a path exists; otherwise Save As
- Session + linked files auto-save on device
- Dirty close prompt: Save / Don’t save / Cancel
- **Single instance**: double-clicking another `.wango` focuses the running app and switches tabs instead of spawning a second process

### 1.3 Home
- Open project, empty project, Getting started (sample)
- Recent list (remove from list / delete forever)
- **Drop a `.wango`** to open

### 1.4 Multi-project tabs
- Multiple projects at once
- Double-click a tab to rename the display name (does not rename the file on disk)
- Quick jump to other recents

---

## 2. Tree editing

- Child / sibling / promote / demote / delete
- Drag-and-drop (before / after / as child)
- Expand / collapse
- In-tree search (match count, clear)
- Derived numbering (display-only, not stored)
- **Left-click** selects and opens the body; **right-click** opens the menu only (does not swap the editor)
- Context menu: add child, copy, paste, **priority (submenu: none / high / medium / low)**, labels, delete

---

## 3. Rich text body

Built on TipTap:

| Area | Capabilities |
|------|----------------|
| Blocks | Paragraph, Heading 1 / 2 |
| Text | Bold, italic, underline, font, size, color, highlight |
| Structure | Bulleted / numbered lists, links |
| Special | Code blocks (language, copy, line numbers, collapse), callouts |
| Media | Insert / drop images, resize, delete |
| History | Undo |

### 3.1 Drop routing
- **Images** → body
- **Common text files** → title + code block (not the attachment rail)
- **Other** (pdf, zip, docx, …) → attachments
- Very large text (~200KB+) or binary → attachments
- The “Add attachment” picker always treats files as attachments

### 3.2 Extensions that become code blocks
`txt` `md` `markdown` `json` `py` `js` `mjs` `cjs` `jsx` `ts` `tsx` `css` `html` `htm` `xml` `yaml` `yml` `toml` `csv` `rs` `go` `java` `c` `h` `cpp` `cc` `cxx` `hpp` `sql` `sh` `bash` `zsh`

### 3.3 Attachments
- Add / open / remove
- Packed into the `.wango` on save

---

## 4. Export

| Format | Notes |
|--------|--------|
| Markdown (for AI) | Headings + body for LLM prompts |
| PDF (reading) | Document-oriented export |
| Mind map (structure) | Structure PNG rooted at the project name |
| Content images | Long image or per-node batches |
| Save as `.wango` | Full ZIP copy, independent of the current path |

Some exports support whole project vs current subtree, with restart / preserve numbering.

---

## 5. Inspiration (AI, optional)

Configure under **Settings → AI** (OpenAI-compatible):

- API Base URL
- API Key
- Model id

Modes:

1. **Refine framework** — polish from current tree + body → **new tab**, original untouched  
2. **From one sentence** — full tree + body from a single prompt  
3. **Outline only** — titles only  

Streaming, cancellable; credentials stay on device (never written into `.wango`).  
Core write / save / export works fully offline.

---

## 6. Settings & i18n

- UI language: Chinese / English
- Tabs: General / AI / About
- Optional default export directory (project Save As still follows the project path)
- Window size / position remembered

---

## 7. Build & distribute

```bash
npm run tauri:dev      # daily desktop debug
npm run tauri:build    # portable exe, no installer
```

Artifact: `src-tauri/target/release/wango.exe`  
Recipients usually need only that file (Windows + WebView2; Win10/11 typically include it).  
Unsigned builds may trigger Defender — choose **Run anyway**.

---

## 8. Checklist

- [x] Tree edit, drag-drop, priority submenu, labels
- [x] Right-click does not change the body; left-click opens the node
- [x] Rich text + code blocks + callouts + images
- [x] Attachments
- [x] `.wango` ZIP + legacy JSON open
- [x] Multi-tab + recents + home drop-open
- [x] Single-instance open
- [x] Export Markdown / PDF / mind map / images / `.wango`
- [x] Inspiration (refine / sentence / outline)
- [x] zh / en UI + local API settings
- [x] Portable exe (no NSIS)

---

*Aligned with 0.3.37; when in doubt, trust the running UI.*

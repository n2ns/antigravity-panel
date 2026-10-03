---
name: devhost-debug
description: Inspect this extension running in the Antigravity IDE Extension Development Host (F5) - sidebar DOM and screenshots, extension host state through non-pausing logpoints, the dev host's own Language Server and log, and Auto-Accept dry runs. Use after changing UI, webview messages, connection or parsing, or automation code, to confirm the change in the real IDE beyond unit tests.
---

# Extension Development Host debugging

The F5 Extension Development Host is a real Antigravity IDE window. Its extension host runs in WSL on this machine with an inspector port, it has its own live Language Server, and its renderer is reachable over CDP when the IDE was started with `--remote-debugging-port=9222`. `devhost.mjs` finds all of this by itself; the inspector port changes on every launch.

```bash
node .claude/skills/devhost-debug/devhost.mjs <command> [args]
```

| Command | What it does |
|---|---|
| `status` | Extension host PID and inspector port, Language Server PID, log file, dev host page, sidebar version and Auto-Accept state |
| `log [--lines N] [--grep re]` | Tail of the dev host "Antigravity Panel" output log |
| `shot [out.png]` | Screenshot of the dev host window; pass a path in your scratchpad directory, then view it with Read |
| `webview '<expr>'` | Evaluate in the sidebar webview; `doc` is the sidebar document, e.g. `doc.querySelector('.auto-accept-status')?.innerText` |
| `page '<expr>'` | Evaluate in the dev host workbench page (Agent panel lives here as `.antigravity-agent-side-panel`) |
| `host '<expr>'` | Evaluate in the extension host global scope (`process`, `process.getBuiltinModule`); module internals are not reachable here |
| `logpoint '<source regex>' '<expr>' [--seconds N] [--max N]` | Non-pausing logpoint in `dist/extension.js`: records `<expr>` each time the matched location runs, then removes itself |
| `dryrun [--terminal]` | Auto-Accept scan built from `src`, with the click and DOM marker stripped, run on the dev host page; prints `{ panel, events }` |

## Workflow

1. `npm run build` (or keep `npm run watch` running, see logpoints).
2. Ask the user to reload the Extension Development Host window. Do not reload it yourself.
3. `status`, then `shot` / `webview` / `log` to check the result; `logpoint` for extension host state; `dryrun` for Auto-Accept scan changes.
4. Report what was observed in the dev host separately from unit test results, and say which states could not be produced (for example no pending Agent action).

## Rules

- Read-only by default. Expressions passed to `webview`, `page`, `host` and `logpoint` must not change state: no clicks, no setting writes, no command execution, no message posting.
- Ask the user first before anything that acts: clicking or typing over CDP, pausing breakpoints (they freeze the dev host extension host, which the user sees as a hang), toggling settings, reloading windows.
- `tfa.system.autoAccept` and `tfa.system.autoAcceptTerminal` are application-scoped: turning Auto-Accept on in the dev host also turns it on for the installed extension in the user's main window, and the CDP fallback scans every workbench window. Ask the user to toggle it, and to turn it off afterwards.
- Never run the real Auto-Accept scan against the IDE; use `dryrun`.
- Do not touch the user's main window: `devhost.mjs` only targets the page that hosts this repo's sidebar (`dist/` of this checkout). Do not navigate, reload or close any page.
- If you start `npm run watch`, stop it by its PID when done.

## Limits

- `logpoint` matches source text in the loaded bundle. The production build is minified, so variable names are mangled; for readable names, run `npm run watch` (unminified, inline sourcemaps) and have the user reload the dev host. Pick a location inside a function that actually runs (a string in a module-level constant only runs at load), and keep expressions small; each hit is serialized with `JSON.stringify`.
- `status` needs the Antigravity Panel view open in the dev host; the sidebar is how the dev host page is identified.
- None of this runs in CI; unit tests remain the gate. Connection and parsing changes still need `npm run debug:server` (see `docs/DEBUGGING.md`).

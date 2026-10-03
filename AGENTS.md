# AGENTS.md

Guidance for AI coding agents, and for humans, working in this repository. Every rule here is mandatory. When a task conflicts with a rule, stop and report the conflict instead of working around it. Facts that change often (test counts, component lists, version numbers) are deliberately not repeated here; follow the links.

## First rule: use the real IDE environment

- The current development workspace is running inside the real Antigravity IDE. Use its local Language Server for relevant runtime validation; do not assume this is plain VS Code or an environment without a live server.
- For connection or response-parsing changes, run `npm run debug:server` and `npm run test:server` against the local Language Server, following [docs/DEBUGGING.md](docs/DEBUGGING.md).
- If server detection or connection fails, investigate and report the observed blocker. Report actual live-server passes separately from skipped or unrun checks; being inside the IDE alone does not prove a working connection.
- To check a change in the F5 Extension Development Host (sidebar DOM and screenshots, extension host logpoints, Auto-Accept dry runs), use the `devhost-debug` skill: [.claude/skills/devhost-debug/SKILL.md](.claude/skills/devhost-debug/SKILL.md). Its script also runs without Claude Code.

## What this project is

Antigravity Panel is an extension for Google Antigravity IDE, built on the VS Code extension API (`engines.vscode` in `package.json`). It polls the local Antigravity Language Server over HTTP for AI quota data, manages the IDE's conversation and code-context caches under `~/.gemini/antigravity-ide/`, and offers an opt-in Auto-Accept automation. Stack: TypeScript, Lit webview, esbuild bundling, Mocha + Sinon tests, Node.js 24 (the version used in `.github/workflows/`). Published as `n2ns.antigravity-panel` on the VS Code Marketplace and Open VSX.

## Repository map

The directory layout and the layer-by-layer description are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#repository-layout).

## Quality checks

All of these must pass before work is considered done. CI runs the same set on Linux, Windows and macOS.

```bash
npm run lint          # ESLint on src/
npm run typecheck     # tsc on production sources, no emit
npm run check:l10n    # locale key sets, placeholders, protected English labels
npm test              # unit tests in plain Node with vscode mocked
npm run test:server   # live Language Server tests; they skip themselves when no server is running
npm run build         # esbuild: extension, webview JS and CSS into dist/
```

The husky pre-commit hook runs `lint-staged` (ESLint auto-fix on staged `.ts` files) and `npm test`. Review `git status` for staged and untracked files before committing.

Other commands: `npm run watch` (development build with sourcemaps), `npm run package` (VSIX), `npm run typecheck:debug`, and the `npm run debug:*` diagnostics described in [docs/DEBUGGING.md](docs/DEBUGGING.md).

## Hard rules

### Architecture

- `src/model/` and `src/shared/` are meant to run in plain Node. Reach the IDE through interfaces injected from `extension.ts` (`IConfigReader` in `src/shared/config/config_manager.ts`; `IQuotaService`, `ICacheService`, `IStorageService`, `IAutomationService` in `src/model/services/interfaces.ts`), not by importing `vscode`.
- Files that legitimately import `vscode`: `extension.ts`, everything under `src/view/`, and the standalone `src/commitMessageClaude.ts`. The remaining imports are legacy exceptions, listed once under [Dependency rule](docs/ARCHITECTURE.md#dependency-rule) in `docs/ARCHITECTURE.md`. Do not add new ones; wrap new IDE access behind an injected interface.
- Keep the MVVM boundaries: services know nothing about the webview, the webview talks to the extension host only through messages, and `AppViewModel` is the only state owner.
- New behavior and bug fixes come with unit tests in `src/test/suite/` that run without an IDE or a live server.

### Webview security

- No `unsafe-inline` for scripts; scripts load with a nonce. Styles live in external CSS bundled to `dist/webview.css`.
- `style-src 'unsafe-inline'` is the single allowed CSP exception, required for the dynamic gradients of the gauges.

### Localization

- Every new or changed string goes into all locales at the same time: manifest strings into every `package.nls.*.json`, runtime strings into every `l10n/bundle.l10n.*.json`.
- Protected UI labels and command titles stay in English in every locale; tooltips, descriptions and notifications are translated. Rules: [docs/LOCALIZATION_RULES.md](docs/LOCALIZATION_RULES.md). `npm run check:l10n` enforces them.

### Configuration

- All settings use the `tfa.` prefix and are declared in `package.json`. The defaults and constraints declared there are the source of truth; `ConfigManager` reads must match them.
- `tfa.system.autoAccept` and `tfa.system.autoAcceptTerminal` are application-scoped. Keep them that way.

### Versioning and release

- `package.json` is the single source of truth for the version. CHANGELOG entries are historical records.
- A release is a `v<version>` tag. `.github/workflows/publish.yml` builds and tests once, then publishes the same VSIX to the Marketplace, Open VSX and GitHub Releases. Keep the publishing jobs artifact-based.

### Git

- Commit messages follow Conventional Commits: `<type>: <description>` with `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`.
- Branch names, when a branch is used: `<type>/<short-description>`, for example `feat/quota-prediction`, `fix/statusbar-display`, `docs/update-readme`.
- Only manage files tracked by git. Never delete untracked files you did not create yourself.

### Documentation

- Documentation is English only. Do not create translated copies.
- `TODO.md` holds pending work only. Remove finished items and record them in `CHANGELOG.md` or `docs/FEATURES.md`.
- Temporary design or analysis documents are deleted once the work is implemented.
- Do not write volatile numbers (test counts, file counts) into documentation.

## When you change X, also update Y

| Change | Also update |
|---|---|
| User-visible behavior | `docs/FEATURES.md`, the next version section of `CHANGELOG.md`, strings in all locales |
| New or changed setting | `package.json` contributes, every `package.nls.*.json`, the settings table in `docs/FEATURES.md`, `ConfigManager` |
| New command | `package.json` contributes, every `package.nls.*.json`, `extension.ts`, the command table in `README.md` |
| Service boundaries, webview messages, lifecycle | `docs/ARCHITECTURE.md` |
| Quota pools, model matching, history format | `quota_strategy.json`, `docs/QUOTA_DATA_MODEL.md`, `src/test/suite/quota_strategy_manager.test.ts` |
| Connection or response parsing | Run `npm run debug:server` against a live server; see `docs/DEBUGGING.md` |
| Protected UI labels | The protected label lists in `scripts/check_l10n.js` and `docs/LOCALIZATION_RULES.md` |
| Finished TODO item | Remove it from `TODO.md` |

## Known pitfalls

- Extension Host debugging (F5) and `npm run test:server` need Antigravity IDE with its local Language Server, not plain VS Code. Without a server the live tests skip, so a green `test:server` does not prove the connection path.
- The CDP fallback of Auto-Accept needs the IDE started with `--remote-debugging-port=9222`; terminal command approval works only through CDP.
- `npm test` compiles into `out/`; concurrent test runs in one checkout overwrite each other. When several agents run unit tests at the same time, each compiles into its own directory directly under the project root and removes it afterwards:

  ```bash
  npx tsc -p tsconfig.test.json --outDir .out-<agent-name> && node .out-<agent-name>/test/runUnitTests.js
  rm -rf .out-<agent-name>
  ```

  The directory must sit directly under the project root: the NLS and l10n tests locate project files with `../../../` relative paths. `.out-*/` is ignored by git and excluded from the VSIX; delete it anyway when the run is done. The pre-commit hook always runs `npm test` into the shared `out/`, so only one agent commits at a time.
- `docs/DISCLAIMER.md` is shipped inside the VSIX and opened by the About command. Keep its name and location.
- Server numeric fields may be omitted when zero (protobuf `omitempty`). Map missing optional numbers to explicit defaults.
- Mocha runs with the TDD interface: `suite` and `test`, not `describe` and `it`.
- `src/extension.ts` and `src/view/webview/` are excluded from the test compilation; logic that needs tests belongs in the model, view-model or shared layers.

## Documentation index

Which document covers what, and for whom: [CONTRIBUTING.md](CONTRIBUTING.md#-documentation).

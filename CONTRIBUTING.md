# Contributing to Antigravity Panel

Thank you for your interest in contributing to **Antigravity Panel**! Contributions from the community help make this extension robust, secure, and user-friendly.

This guide outlines our development workflow, project architecture, coding standards, and testing procedures. Please review it before submitting a Pull Request.

---

## 🏗️ Project Architecture

The extension follows an **MVVM (Model-View-ViewModel)** pattern. Services in `src/model/` hold the business logic and reach the IDE through injected interfaces rather than importing `vscode`; `AppViewModel` in `src/view-model/` is the single source of truth for application state; `src/view/` hosts the sidebar webview (Lit components), the status bar, and the HTML/CSP builder.

The layer-by-layer description, directory map, build pipeline, connection lifecycle, and test layout are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read it before changing service boundaries or the webview message protocol.

---

## 🛠️ Development & Environment Setup

### Prerequisites
*   **Antigravity IDE**. Development, debugging, and testing for this extension must be done in Antigravity IDE, not generic VS Code.
*   A running local **Antigravity Language Server**. The extension is designed around the local Language Server that Antigravity IDE starts.
*   [Node.js](https://nodejs.org/) 24 or later.
*   `npm` (v10+).

### Quick Start Setup
1.  Fork and clone the repository:
    ```bash
    git clone https://github.com/n2ns/antigravity-panel.git
    cd antigravity-panel
    ```
2.  Install all dependencies:
    ```bash
    npm install
    ```
3.  Launch local compilation in watch mode:
    ```bash
    npm run watch
    ```
    This launches `esbuild.js` in watch mode to automatically compile changes in `src/extension.ts` (Extension backend), webview components (Webview frontend), and CSS styles.

### Testing Inside Antigravity IDE
1.  Open the workspace in **Antigravity IDE**.
2.  Press **`F5`** (or go to the *Run and Debug* panel and select **Run Antigravity Panel (Extension Host)**).
3.  A new **Antigravity IDE Extension Development Host** window will open. In this sandbox environment, the extension will directly connect to your local **Antigravity Language Server** instance. This allows you to verify UI changes with real live quota metrics, token credits, and cache tracking.

---

## 🧪 Testing Requirements

We enforce automated test checks. Ensure that your contributions do not break existing tests and that you write new tests for any added features or bug fixes.

*   **Production typecheck:** Validate extension and Webview TypeScript without emitting build artifacts.
    ```bash
    npm run typecheck
    ```
*   **Localization consistency:** Validate manifest/runtime keys, placeholders, and protected English UI labels across every locale.
    ```bash
    npm run check:l10n
    ```
*   **Unit tests:** Verify core business logic and platform parsing without requiring a live Antigravity Language Server.
    ```bash
    npm test
    ```
*   **Server integration tests:** Run the live Language Server integration subset directly.
    ```bash
    npm run test:server
    ```

> [!IMPORTANT]
> The live Language Server tests are expected to run in Antigravity IDE development environments. If they cannot find a local Antigravity Language Server, the environment is incomplete for full project validation.

> [!IMPORTANT]
> `husky` runs `lint-staged` (ESLint with auto-fix on staged `.ts` files) and `npm test` before every commit. Before opening a Pull Request, run the full set of quality checks listed in [AGENTS.md](AGENTS.md#quality-checks): `npm run lint`, `npm run typecheck`, `npm run check:l10n`, `npm test`, `npm run test:server`, and `npm run build`.

---

## 📦 Build & Packaging

To verify the production build directly:

```bash
npm run build
```

To create a local `.vsix` installer (`vscode:prepublish` runs the production build automatically):

```bash
npm run package
```

The package script rebuilds `dist/` before creating the VSIX.

### Release Publishing

Release tags trigger `.github/workflows/publish.yml`. The build job runs linting, production typechecking, unit tests, live Language Server tests, and packaging once to create one `vsix-package` artifact. The publishing jobs submit that same VSIX to the Visual Studio Marketplace and the verified `n2ns` namespace on Open VSX, while the release job attaches it to GitHub Releases. Keep publishing jobs artifact-based so all three channels receive the same tested bytes.

---

## 🎨 Code Style & Standards

We use `eslint` and `typescript` strict mode to maintain code quality.

*   Run the linter manually to check your changes:
    ```bash
    npm run lint
    ```
*   **Formatting Rules:** We enforce standard JavaScript/TypeScript style with strict rules, such as:
    *   No unused imports or variables (except prefixed with `_`).
    *   Minimize `any` types (use type parameters or unknown instead).
    *   Always write comprehensive types for views and messages.

### 🌐 Localization & Translation Policy
The extension ships 15 locales. UI labels and command titles stay in English; tooltips, descriptions, and notifications are localized. New keys go into every `package.nls.*.json` and `l10n/bundle.l10n.*.json` file at the same time, and `npm run check:l10n` enforces this. The rules are defined in [docs/LOCALIZATION_RULES.md](docs/LOCALIZATION_RULES.md).

---

## 🚀 Pull Request (PR) Workflow

1.  **Create a Branch:** Create a branch named `feature/your-feature-name` or `fix/your-fix-name`.
2.  **Make Code Changes:** Keep your commits clean and focused. Use descriptive conventional commits titles (e.g., `feat: ...`, `fix: ...`).
3.  **Run Quality Checks:**
    *   Format and lint: `npm run lint`
    *   Validate production types and localization: `npm run typecheck` and `npm run check:l10n`
    *   Ensure all tests pass: `npm test` and `npm run test:server`
    *   Verify the production build: `npm run build`
4.  **Create a Pull Request:**
    *   Push your branch and open a PR against the `main` branch.
    *   Provide a clear summary of your changes and reference any related issues (e.g., `Fixes #123`).
    *   Wait for the maintainers to review and merge your PR.

Thank you for helping us build a better Antigravity Panel!

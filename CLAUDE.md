# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Toolkit for Antigravity is a VS Code extension that monitors AI quota usage and manages cache for Google Antigravity IDE. It communicates with a local Antigravity Language Server via gRPC-Web to fetch real-time quota data.

## Development Commands

```bash
# Build the extension (outputs to dist/)
npm run build

# Watch mode with sourcemaps for development
npm run watch

# Lint TypeScript files
npm run lint

# Run unit tests
npm test

# Run server integration tests
npm run test:server

# Package as .vsix for distribution
npm run package
```

## Pre-commit Requirements

Before committing, all of these must pass:
- `npm run lint` - ESLint
- `npm run build` - TypeScript compilation
- `npm test` - Unit tests

Husky is configured with lint-staged to auto-fix linting on staged `.ts` files.

## Architecture

The extension follows MVVM architecture with strict separation of concerns:

```
src/
├── extension.ts          # Entry point, DI setup, command registration
├── model/               # Business logic (no vscode imports)
│   └── services/        # QuotaService, CacheService, StorageService, AutomationService
├── view-model/          # State management (AppViewModel)
│   └── app.vm.ts        # Single source of truth for app state
├── view/                # UI components
│   ├── sidebar-provider.ts   # Webview provider
│   ├── status-bar.ts         # Status bar indicator
│   └── webview/components/   # Lit.js web components
└── shared/              # Cross-cutting utilities
    ├── config/          # ConfigManager, quota_strategy.json
    ├── platform/        # ProcessFinder (cross-platform server detection)
    └── utils/           # Scheduler, HttpClient, Logger, etc.
```

**Critical Rule**: Core business logic modules (`model/`, `shared/`) must NOT import `vscode` directly. Use dependency injection via interfaces.

## Key Patterns

- **Dependency Injection**: Services implement interfaces (e.g., `IQuotaService`, `ICacheService`)
- **Observer Pattern**: ViewModel emits events (`onStateChange`, `onQuotaChange`, `onCacheChange`) that views subscribe to
- **Cache-First Startup**: UI renders from cached globalState immediately, then fetches fresh data
- **Strategy Pattern**: `QuotaStrategyManager` maps AI models to display groups via `quota_strategy.json`

## Webview Components

Located in `src/view/webview/components/`, built with Lit.js. Key components:
- `sidebar-app.ts` - Main container
- `quota-dashboard.ts` - Quota gauges
- `quota-pie.ts` - Gauge renderers (semi-arc, classic-donut)
- `usage-chart.ts` - Time-series consumption chart
- `folder-tree.ts` - Brain tasks and code context trees

**CSP Note**: `style-src 'unsafe-inline'` is required for dynamic chart rendering (conic-gradient).

## Localization

Supports 13 languages. Key rules:
- **UI labels and technical terms**: Keep in English (Rules, MCP, Auto-Accept, etc.)
- **Tooltips and descriptions**: Fully localized

When adding new strings:
1. Add English key to `bundle.l10n.json`
2. Add corresponding `*Tooltip` or `*Description` key for localization
3. Mirror in all `bundle.l10n.*.json` files and `package.nls.*.json` files

## Configuration

Extension settings use `tfa.*` prefix. Configuration groups:
- `tfa.dashboard.*` - Gauge style, view mode, refresh rate, UI scale
- `tfa.status.*` - Status bar display format, thresholds
- `tfa.cache.*` - Auto-clean settings, scan interval
- `tfa.system.*` - Server host, debug mode, auto-accept
- `tfa.commitMessageClaude.*` - LLM commit message generation

## Testing

Test files in `src/test/` mirror source structure. Uses Mocha + Sinon.
- Unit tests: `npm test`
- Server tests: `npm run test:server`

## Git Conventions

- **Branch format**: `<type>/<short-description>` (e.g., `feature/quota-prediction`, `fix/statusbar-display`)
- **Commits**: Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)

## Platform Support

Cross-platform (Windows, macOS, Linux) with special handling:
- Windows: PowerShell-based process detection
- Unix: `ps`/`lsof` based detection
- WSL: Special path and process handling in `src/shared/utils/wsl.ts`

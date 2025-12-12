English | [中文文档](RULES_zh.md)

# Project Rules

## Documentation

### TODO
- Pending tasks only; remove completed
- Completed → CHANGELOG or FEATURES

### Multi-language
- All docs have EN/ZH versions
- Top of file: language switch links

### README
- Bottom: link to FEATURES, CHANGELOG, TODO

### Design Docs
- Delete after implementation complete

### Cleanup
- Only manage files tracked by git
- Ignore untracked `.md` files

## Version
- `package.json` is the single source of truth
- CHANGELOG versions are historical records

## Architecture
- Core modules must not depend on `vscode`
- Use dependency injection for testability

## Security
- CSP: no `unsafe-inline`
- Styles in external CSS files

## i18n
- New features: update all 11 language files (`package.nls.*.json`)

## Pre-commit Checks
- `npm run lint` - ESLint
- `npm run build` - Compile
- `npm test` - Unit tests

## Git

### Branch Naming
```
<type>/<short-description>
```
Examples: `feature/quota-prediction`, `fix/statusbar-display`, `docs/update-readme`

### Commit Messages (Conventional Commits)
```
<type>: <description>
```
Types: `feat`, `fix`, `refactor`, `docs`, `chore`


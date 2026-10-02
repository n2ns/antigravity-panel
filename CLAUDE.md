@AGENTS.md

## Claude Code specifics

- When several agents run unit tests at the same time in this checkout, do not use `npm test` (it compiles into the shared `out/` directory). Each agent compiles into its own directory directly under the project root and removes it afterwards:

  ```bash
  npx tsc -p tsconfig.test.json --outDir .out-<agent-name> && node .out-<agent-name>/test/runUnitTests.js
  rm -rf .out-<agent-name>
  ```

  The directory must sit directly under the project root: the NLS and l10n tests locate project files with `../../../` relative paths. `.out-*/` is ignored by git and excluded from the VSIX; delete it anyway when the run is done.
- The coordinating agent runs the full `npm test` once at the end.

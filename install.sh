#!/bin/bash
bun run package && \
    npx vsce package && \
    code --install-extension ./*.vsix
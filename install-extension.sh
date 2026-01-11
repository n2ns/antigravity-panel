#!/bin/bash

# Installation script for Antigravity Panel Extension
# This script helps install the VSIX file in Antigravity IDE

VSIX_FILE="antigravity-panel-2.4.7.vsix"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🔧 Antigravity Panel Extension Installer"
echo "========================================"
echo ""

# Check if VSIX exists
if [ ! -f "$SCRIPT_DIR/$VSIX_FILE" ]; then
    echo "❌ Error: $VSIX_FILE not found in $SCRIPT_DIR"
    exit 1
fi

echo "✅ Found: $VSIX_FILE"
echo "📍 Location: $SCRIPT_DIR/$VSIX_FILE"
echo ""
echo "📋 Installation Steps:"
echo ""
echo "1. Open Antigravity IDE (not VS Code)"
echo "2. Press Cmd+Shift+P to open Command Palette"
echo "3. Type: 'Extensions: Install from VSIX...'"
echo "4. Navigate to and select:"
echo "   $SCRIPT_DIR/$VSIX_FILE"
echo "5. Click 'Install' and wait for confirmation"
echo "6. Reload window when prompted"
echo ""
echo "🔍 After installation, check the Antigravity Panel:"
echo "   - Look for specific error messages (not generic ones)"
echo "   - Click 'Show Logs' to see detailed diagnostics"
echo "   - The logs will show workspace ID matching issues"
echo ""
echo "📊 Current Status:"
echo "   Language Server: RUNNING ✅"
echo "   Port: 55974"
echo "   Workspace: file_Users_simbatmotsi_Documents_Projects_open_20source_antigravity_panel"
echo ""
echo "⚠️  Known Issue: Space in folder name 'open source'"
echo "   The space is encoded as '_20' which may cause matching issues"
echo ""
echo "Press Enter to open the folder in Finder..."
read

open "$SCRIPT_DIR"

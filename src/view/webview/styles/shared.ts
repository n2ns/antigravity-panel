/**
 * Shared utilities for webview components
 * 
 * Light DOM mode: Styles are loaded from external webview.css
 */

/**
 * Get the codicon icon class for a file based on its name
 */
export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const iconMap: Record<string, string> = {
    // Images - use symbol-color (palette icon)
    'png': 'codicon-symbol-color',
    'jpg': 'codicon-symbol-color',
    'jpeg': 'codicon-symbol-color',
    'gif': 'codicon-symbol-color',
    'svg': 'codicon-symbol-color',
    'webp': 'codicon-symbol-color',
    'ico': 'codicon-symbol-color',

    // Code
    'ts': 'codicon-file-code',
    'tsx': 'codicon-file-code',
    'js': 'codicon-file-code',
    'jsx': 'codicon-file-code',
    'py': 'codicon-file-code',
    'java': 'codicon-file-code',
    'c': 'codicon-file-code',
    'cpp': 'codicon-file-code',
    'h': 'codicon-file-code',
    'cs': 'codicon-file-code',
    'go': 'codicon-file-code',
    'rs': 'codicon-file-code',
    'rb': 'codicon-file-code',
    'php': 'codicon-file-code',
    'swift': 'codicon-file-code',
    'kt': 'codicon-file-code',
    'css': 'codicon-file-code',
    'scss': 'codicon-file-code',
    'less': 'codicon-file-code',
    'html': 'codicon-file-code',
    'vue': 'codicon-file-code',

    // Documents
    'md': 'codicon-markdown',
    'txt': 'codicon-file-text',
    'pdf': 'codicon-file-pdf',
    'doc': 'codicon-file-text',
    'docx': 'codicon-file-text',

    // Configuration
    'json': 'codicon-json',
    'yaml': 'codicon-file-code',
    'yml': 'codicon-file-code',
    'xml': 'codicon-file-code',
    'toml': 'codicon-file-code',
    'ini': 'codicon-file-code',
    'env': 'codicon-file-code',

    // Archives
    'zip': 'codicon-file-zip',
    'tar': 'codicon-file-zip',
    'gz': 'codicon-file-zip',
    'rar': 'codicon-file-zip',
    '7z': 'codicon-file-zip',

    // Other
    'log': 'codicon-output',
    'sh': 'codicon-terminal',
    'bat': 'codicon-terminal',
    'ps1': 'codicon-terminal',
  };

  return iconMap[ext] || 'codicon-file';
}

/**
 * Get icon color class
 */
export function getFileIconColorClass(iconClass: string): string {
  if (iconClass === 'codicon-symbol-color') return 'file-icon-media';
  if (iconClass.includes('code')) return 'file-icon-code';
  if (iconClass === 'codicon-markdown') return 'file-icon-md';
  if (iconClass === 'codicon-json') return 'file-icon-json';
  return '';
}

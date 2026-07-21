/**
 * Webview entry file
 * 
 * Import main app component to trigger all custom element registrations
 */

import './components/sidebar-app.js';

// Export types for external use
export * from './types.js';

// Global context menu disable
document.addEventListener('contextmenu', event => event.preventDefault());

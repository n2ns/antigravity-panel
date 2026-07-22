// format.ts: Simple human-readable formatting utilities.

/**
 * Format a duration until quota reset (e.g. "2h 13m", "3d 4h", "Ready").
 * Shared between QuotaService (server snapshots) and the webview countdown tick.
 */
export function formatTimeUntilReset(ms: number): string {
  if (ms <= 0) {
    return 'Ready';
  }
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days >= 7) {
      const weeks = Math.floor(days / 7);
      const remDays = days % 7;
      if (remDays === 0 && remainingHours === 0) {
        return `${weeks}w`;
      }
      if (remDays === 0) {
        return `${weeks}w ${remainingHours}h`;
      }
      if (remainingHours === 0) {
        return `${weeks}w ${remDays}d`;
      }
      return `${weeks}w ${remDays}d ${remainingHours}h`;
    }
    return `${days}d ${remainingHours}h`;
  }
  return `${hours}h ${mins % 60}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

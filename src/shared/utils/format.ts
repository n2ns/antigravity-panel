// format.ts: Simple human-readable formatting utilities.

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

export function formatPercent(used: number, total: number): string {
  if (total <= 0) {
    return "-";
  }

  const percent = (used / total) * 100;
  return `${percent.toFixed(0)}%`;
}

export function formatResetTime(dateStr: string): string {
  const reset = new Date(dateStr);
  const now = new Date();
  const diff = reset.getTime() - now.getTime();

  if (diff <= 0) return 'Ready';

  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

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

export function formatPercentage(used: number, total: number): string {
  if (total <= 0) {
    return "-";
  }

  const percent = (used / total) * 100;
  return `${percent.toFixed(0)}%`;
}


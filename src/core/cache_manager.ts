/**
 * CacheManager: Responsible for scanning and cleaning ~/.gemini/antigravity/brain/ and conversations/ directories.
 */

import * as fs from "fs";
import * as path from "path";
import { getBrainDir, getConversationsDir } from "../utils/paths";
import { BrainTask, CacheInfo } from "../utils/types";

// Re-export types for backward compatibility
export type { BrainTask, CacheInfo };

export class CacheManager {
  private baseBrainDir: string;
  private baseConversationsDir: string;

  constructor(brainDir?: string, conversationsDir?: string) {
    this.baseBrainDir = brainDir || getBrainDir();
    this.baseConversationsDir = conversationsDir || getConversationsDir();
  }

  /**
   * Recursively calculate directory size (in bytes)
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const stat = await fs.promises.stat(dirPath);
      if (!stat.isDirectory()) {
        return stat.size;
      }

      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      let totalSize = 0;

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const fileStat = await fs.promises.stat(fullPath);
          totalSize += fileStat.size;
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Get the number of files in a directory
   */
  private async getFileCount(dirPath: string): Promise<number> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).length;
    } catch {
      return 0;
    }
  }

  /**
   * Scan brain directory and return list of tasks with metadata
   */
  private async getBrainTasks(brainDir: string): Promise<BrainTask[]> {
    try {
      const entries = await fs.promises.readdir(brainDir, { withFileTypes: true });
      const tasks: BrainTask[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const taskPath = path.join(brainDir, entry.name);
        const [size, fileCount, label, stat] = await Promise.all([
          this.getDirectorySize(taskPath),
          this.getFileCount(taskPath),
          this.getTaskLabel(taskPath, entry.name),
          fs.promises.stat(taskPath),
        ]);

        tasks.push({
          id: entry.name,
          label,
          path: taskPath,
          size,
          fileCount,
          createdAt: stat.birthtimeMs,
        });
      }

      // Sort by creation time descending (newest first)
      return tasks.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  /**
   * Extract task label from task.md file, with fallback to directory name
   */
  private async getTaskLabel(taskPath: string, fallbackId: string): Promise<string> {
    try {
      const taskMdPath = path.join(taskPath, "task.md");
      const content = await fs.promises.readFile(taskMdPath, "utf-8");
      // Try to extract first line as label (usually a markdown heading)
      const firstLine = content.split("\n")[0];
      if (firstLine && firstLine.startsWith("#")) {
        return firstLine.replace(/^#+\s*/, "").trim().substring(0, 50);
      }
      // If no heading found, use first 30 characters of content
      const text = content.trim().substring(0, 30);
      return text || fallbackId.substring(0, 8);
    } catch {
      return fallbackId.substring(0, 8);
    }
  }

  /**
   * Get comprehensive cache information including sizes and task list
   */
  public async getCacheInfo(): Promise<CacheInfo> {
    const brainDir = this.baseBrainDir;
    const conversationsDir = this.baseConversationsDir;

    const [brainSize, conversationsSize, brainTasks, conversationsCount] =
      await Promise.all([
        this.getDirectorySize(brainDir),
        this.getDirectorySize(conversationsDir),
        this.getBrainTasks(brainDir),
        this.getFileCount(conversationsDir),
      ]);

    return {
      brainSize,
      conversationsSize,
      totalSize: brainSize + conversationsSize,
      brainCount: brainTasks.length,
      conversationsCount,
      brainTasks,
    };
  }

  /**
   * Get total cache size in bytes (simplified interface)
   */
  public async getCurrentSize(): Promise<number> {
    const info = await this.getCacheInfo();
    return info.totalSize;
  }

  /**
   * Remove all contents from specified directory
   */
  private async cleanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      }
    } catch {
      // Silently ignore if directory doesn't exist or lacks permissions
    }
  }

  /**
   * Clean all cache directories (brain + conversations)
   */
  public async clean(): Promise<void> {
    const brainDir = this.baseBrainDir;
    const conversationsDir = this.baseConversationsDir;

    await Promise.all([
      this.cleanDirectory(brainDir),
      this.cleanDirectory(conversationsDir),
    ]);
  }

}

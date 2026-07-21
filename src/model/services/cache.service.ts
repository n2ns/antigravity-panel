/**
 * CacheService: Manages brain tasks and code contexts
 * 
 * Implements ICacheService interface for dependency injection.
 * Responsible for scanning and cleaning ~/.gemini/antigravity/brain/ and conversations/ directories.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getBrainDir, getConversationsDir, getCodeContextsDir } from '../../shared/utils/paths';
import type { ICacheService } from './interfaces';
import type { BrainTask, CacheInfo, CodeContext, FileItem } from '../types/entities';

/**
 * CacheService implementation
 */
export class CacheService implements ICacheService {
    private baseBrainDir: string;
    private baseConversationsDir: string;
    private baseCodeContextsDir: string;

    constructor(brainDir?: string, conversationsDir?: string, codeContextsDir?: string) {
        this.baseBrainDir = brainDir || getBrainDir();
        this.baseConversationsDir = conversationsDir || getConversationsDir();
        this.baseCodeContextsDir = codeContextsDir || getCodeContextsDir();
    }

    // ==================== ICacheService Implementation ====================

    /**
     * Get comprehensive cache information including sizes and task list
     */
    async getCacheInfo(): Promise<CacheInfo> {
        const [brainSize, conversationsSize, brainTasks, codeContexts, conversationsCount] =
            await Promise.all([
                this.getDirectorySize(this.baseBrainDir),
                this.getDirectorySize(this.baseConversationsDir),
                this.getBrainTasks(),
                this.getCodeContexts(),
                this.getFileCount(this.baseConversationsDir),
            ]);

        return {
            brainSize,
            conversationsSize,
            totalSize: brainSize + conversationsSize,
            brainCount: brainTasks.length,
            conversationsCount,
            brainTasks,
            codeContexts,
        };
    }

    /**
     * Get list of brain tasks
     */
    async getBrainTasks(): Promise<BrainTask[]> {
        try {
            const entries = await fs.promises.readdir(this.baseBrainDir, { withFileTypes: true });
            const tasks: BrainTask[] = [];

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const taskPath = path.join(this.baseBrainDir, entry.name);
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
                    createdAt: stat.birthtimeMs || stat.mtimeMs,
                });
            }

            // Sort by creation time descending (newest first)
            return tasks.sort((a, b) => b.createdAt - a.createdAt);
        } catch {
            return [];
        }
    }

    /**
     * Get list of code contexts (projects)
     */
    async getCodeContexts(): Promise<CodeContext[]> {
        try {
            const entries = await fs.promises.readdir(this.baseCodeContextsDir, { withFileTypes: true });
            const contextMap = new Map<string, { size: number; mtime: number }>();

            for (const entry of entries) {
                if (!entry.isFile()) continue;
                // Group by conversation UUID (strip extensions like .db, .db-shm, .db-wal, .pb)
                const baseName = this.getCodeContextBaseName(entry.name);
                if (!baseName) continue; // Skip unknown files
                const filePath = path.join(this.baseCodeContextsDir, entry.name);
                try {
                    const stat = await fs.promises.stat(filePath);
                    const existing = contextMap.get(baseName);
                    const mtimeMs = stat.mtimeMs;
                    contextMap.set(baseName, {
                        size: (existing?.size || 0) + stat.size,
                        mtime: Math.max(existing?.mtime || 0, mtimeMs)
                    });
                } catch { /* skip unreadable files */ }
            }

            const contexts: CodeContext[] = [];
            for (const [id, data] of contextMap) {
                contexts.push({ id, name: id, size: data.size, lastModified: data.mtime });
            }

            // Sort by size descending (largest first)
            return contexts.sort((a, b) => b.size - a.size);
        } catch {
            return [];
        }
    }

    /**
     * Get files within a brain task
     */
    async getTaskFiles(taskId: string): Promise<FileItem[]> {
        if (!this.isValidId(taskId)) return [];
        const taskPath = path.join(this.baseBrainDir, taskId);
        return this.getFilesRecursive(taskPath, taskPath);
    }

    /**
     * Get files within a code context
     */
    async getContextFiles(contextId: string): Promise<FileItem[]> {
        if (!this.isValidId(contextId)) return [];
        try {
            const entries = await fs.promises.readdir(this.baseCodeContextsDir, { withFileTypes: true });
            return entries
                .filter(e => e.isFile() && this.getCodeContextBaseName(e.name) === contextId)
                .map(e => ({
                    name: e.name,
                    path: path.join(this.baseCodeContextsDir, e.name),
                }));
        } catch {
            return [];
        }
    }

    /**
     * Delete a brain task
     */
    async deleteTask(taskId: string): Promise<void> {
        if (!this.isValidId(taskId)) return;
        const taskPath = path.join(this.baseBrainDir, taskId);
        // Guard: resolved path must stay inside baseBrainDir
        if (!taskPath.startsWith(this.baseBrainDir + path.sep)) return;
        await fs.promises.rm(taskPath, { recursive: true, force: true });

        // Also delete corresponding conversation file
        const conversationFile = path.join(this.baseConversationsDir, `${taskId}.pb`);
        await fs.promises.rm(conversationFile, { force: true }).catch(() => { });
    }

    /**
     * Delete a code context
     */
    async deleteContext(contextId: string): Promise<void> {
        if (!this.isValidId(contextId)) return;
        try {
            const entries = await fs.promises.readdir(this.baseCodeContextsDir, { withFileTypes: true });
            const matchingFiles = entries.filter(e => e.isFile() && this.getCodeContextBaseName(e.name) === contextId);
            for (const file of matchingFiles) {
                await fs.promises.rm(path.join(this.baseCodeContextsDir, file.name), { force: true });
            }
        } catch { /* ignore errors */ }
    }

    /**
     * Delete a single file safely
     */
    async deleteFile(filePath: string): Promise<void> {
        const resolvedPath = path.resolve(filePath);
        const isUnderBrain = resolvedPath.startsWith(this.baseBrainDir + path.sep);
        const isUnderContexts = resolvedPath.startsWith(this.baseCodeContextsDir + path.sep);
        const isUnderConversations = resolvedPath.startsWith(this.baseConversationsDir + path.sep);

        if (!isUnderBrain && !isUnderContexts && !isUnderConversations) {
            throw new Error('Access denied: file lies outside allowed cache directories.');
        }

        await fs.promises.rm(resolvedPath, { force: true });
    }

    /**
     * Clean cache by removing old tasks
     * @param keepCount Number of newest tasks to keep (default: 5)
     * @returns Object containing number of tasks deleted and total bytes freed
     */
    async cleanCache(keepCount: number = 5): Promise<{ deletedCount: number, freedBytes: number }> {
        try {
            let deletedCount = 0;
            let freedBytes = 0;

            // 1. Clean Brain Task Directories
            const tasks = await this.getBrainTasks(); // Already sorted by mtime descending
            if (tasks.length > keepCount) {
                const tasksToDelete = tasks.slice(keepCount);
                for (const task of tasksToDelete) {
                    freedBytes += task.size;
                    // Also check for the .pb file size before deleteTask removes it
                    const pbPath = path.join(this.baseConversationsDir, `${task.id}.pb`);
                    try {
                        const pbStat = await fs.promises.stat(pbPath);
                        freedBytes += pbStat.size;
                    } catch { /* ignore if not exists */ }

                    await this.deleteTask(task.id);
                    deletedCount++;
                }
            }

            // 2. Clean Orphan Conversation Files (.pb) 
            // In case some folders were deleted but .pb files remain
            try {
                const pbFiles = await fs.promises.readdir(this.baseConversationsDir, { withFileTypes: true });
                const pbItems = [];
                for (const file of pbFiles) {
                    if (file.isFile() && file.name.endsWith('.pb')) {
                        const filePath = path.join(this.baseConversationsDir, file.name);
                        const stat = await fs.promises.stat(filePath);
                        pbItems.push({ name: file.name, path: filePath, mtime: stat.mtimeMs, size: stat.size });
                    }
                }

                // Sort by mtime descending (newest first)
                pbItems.sort((a, b) => b.mtime - a.mtime);

                if (pbItems.length > keepCount) {
                    const pbToDelete = pbItems.slice(keepCount);
                    for (const item of pbToDelete) {
                        // Check if it's already deleted by the deleteTask loop above
                        try {
                            await fs.promises.access(item.path); // Check if file still exists
                            freedBytes += item.size;
                            await fs.promises.rm(item.path, { force: true });
                            // We don't increment deletedCount here as it primarily tracks brain tasks.
                            // Orphan .pb files are a secondary cleanup.
                        } catch { /* already gone or other error, ignore */ }
                    }
                }
            } catch {
                // Ignore errors reading conversations dir, e.g., if it doesn't exist
            }

            return { deletedCount, freedBytes };
        } catch (err) {
            console.error('Error during cleanCache:', err);
            return { deletedCount: 0, freedBytes: 0 };
        }
    }

    // ==================== Helper Methods ====================

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
     * Extract task label from task.md file, with fallback to directory name
     */
    private async getTaskLabel(taskPath: string, fallbackId: string): Promise<string> {
        try {
            const taskMdPath = path.join(taskPath, 'task.md');
            const content = await fs.promises.readFile(taskMdPath, 'utf-8');
            // Try to extract first line as label (usually a markdown heading)
            const firstLine = content.split('\n')[0];
            if (firstLine && firstLine.startsWith('#')) {
                return firstLine.replace(/^#+\s*/, '').trim();
            }
            // If no heading found, use first 50 characters of content or just full line? 
            // Usually filenames/first lines are okay to display fully.
            const text = content.trim().split('\n')[0];
            return text || fallbackId;
        } catch {
            return fallbackId;
        }
    }

    /**
     * Validates an ID to prevent path traversal attacks.
     * Only allows alphanumeric characters, hyphens, underscores, and dots.
     */
    private isValidId(id: string): boolean {
        return /^[a-zA-Z0-9_.-]+$/.test(id) && id.length > 0 && id.length < 128;
    }

    private getCodeContextBaseName(fileName: string): string | null {
        const baseName = fileName.replace(/\.(db-shm|db-wal|db|pb)$/, '');
        return baseName === fileName ? null : baseName;
    }

    /**
     * Recursively get all files in a directory tree.
     * File names use relative paths from rootDir for clear display.
     * Skips symbolic links and limits recursion depth to prevent infinite loops.
     */
    private async getFilesRecursive(dirPath: string, rootDir: string, maxDepth = 5): Promise<FileItem[]> {
        if (maxDepth <= 0) return [];
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const results: FileItem[] = [];

            for (const entry of entries) {
                if (entry.isSymbolicLink()) continue;
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isFile()) {
                    const relativeName = path.relative(rootDir, fullPath);
                    results.push({ name: relativeName, path: fullPath });
                } else if (entry.isDirectory()) {
                    const subFiles = await this.getFilesRecursive(fullPath, rootDir, maxDepth - 1);
                    results.push(...subFiles);
                }
            }

            return results;
        } catch {
            return [];
        }
    }

    /**
     * Get the brain directory path
     */
    getBrainDirPath(): string {
        return this.baseBrainDir;
    }

}

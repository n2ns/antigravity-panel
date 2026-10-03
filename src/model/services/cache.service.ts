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
import type { BrainTask, CacheInfo, CleanPlan, CleanPlanFile, CleanPlanTask, CleanResult, CodeContext, FileItem } from '../types/entities';
import { errorLog } from '../../shared/utils/logger';

/** Files of one conversation; .db precedes its -wal / -shm so they are only deleted after it */
const CONVERSATION_EXTENSIONS = ['.pb', '.db', '.db-wal', '.db-shm'];
const CONVERSATION_FILE_PATTERN = /^(.+)(\.pb|\.db|\.db-wal|\.db-shm)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConversationFile = { path: string; size: number; mtime: number };

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
        const [brainSize, conversationsSize, brainTasks, codeContexts] =
            await Promise.all([
                this.getDirectorySize(this.baseBrainDir),
                this.getDirectorySize(this.baseConversationsDir),
                this.getBrainTasks(),
                this.getCodeContexts(),
            ]);

        return {
            brainSize,
            conversationsSize,
            totalSize: brainSize + conversationsSize,
            brainTasks,
            codeContexts,
        };
    }

    /**
     * Get list of brain tasks. Only UUID-named directories are tasks; others,
     * such as the IDE's tempmediaStorage, are neither listed nor cleaned.
     */
    async getBrainTasks(): Promise<BrainTask[]> {
        try {
            const entries = await fs.promises.readdir(this.baseBrainDir, { withFileTypes: true });
            const tasks: BrainTask[] = [];

            for (const entry of entries) {
                if (!entry.isDirectory() || !UUID_PATTERN.test(entry.name)) continue;

                const taskPath = path.join(this.baseBrainDir, entry.name);
                let size: number, label: string, stat: fs.Stats;
                try {
                    [size, label, stat] = await Promise.all([
                        this.getDirectorySize(taskPath),
                        this.getTaskLabel(taskPath, entry.name),
                        fs.promises.stat(taskPath),
                    ]);
                } catch {
                    continue; // Task vanished or is unreadable: skip it, keep the others
                }

                tasks.push({
                    id: entry.name,
                    label,
                    path: taskPath,
                    size,
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

        // Also delete the conversation files; keep -wal / -shm if the .db could not be deleted
        for (const ext of CONVERSATION_EXTENSIONS) {
            const deleted = await fs.promises.rm(path.join(this.baseConversationsDir, `${taskId}${ext}`), { force: true })
                .then(() => true, () => false);
            if (!deleted && ext === '.db') break;
        }
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
     * Dry run of cleanCache. Keeps the keepCount most recently active brain tasks
     * (activity = latest file mtime in the task directory or its conversation .pb / .db / .db-wal / .db-shm),
     * and the keepCount newest orphan conversations (conversation files without a brain task directory).
     * The conversation files of a kept task are never selected.
     */
    async getCleanPlan(keepCount: number = 5): Promise<CleanPlan> {
        // Invalid ids are never deletable: exclude them before ranking so they never take a keep slot
        const tasks = (await this.getBrainTasks()).filter(task => this.isValidId(task.id));
        const activities = new Map<string, number>();
        await Promise.all(tasks.map(async task => {
            activities.set(task.id, await this.getTaskActivity(task));
        }));
        // Stable sort: ties keep the display (creation) order
        const byActivity = [...tasks].sort((a, b) => (activities.get(b.id) ?? 0) - (activities.get(a.id) ?? 0));

        const planTasks: CleanPlanTask[] = [];
        for (const task of byActivity.slice(keepCount)) {
            const conversations = (await this.getConversationFiles(task.id)).map(f => ({ path: f.path, size: f.size }));
            planTasks.push(conversations.length > 0 ? { id: task.id, size: task.size, conversations } : { id: task.id, size: task.size });
        }

        const orphans = await this.getOrphanConversations();
        orphans.sort((a, b) => b.mtime - a.mtime);
        const orphanConversations = orphans.slice(keepCount).flatMap(o => o.files.map(f => ({ path: f.path, size: f.size })));

        const sumSizes = (files: CleanPlanFile[] = []) => files.reduce((sum, f) => sum + f.size, 0);
        return {
            keepCount,
            tasks: planTasks,
            orphanConversations,
            conversationFileCount: planTasks.reduce((sum, t) => sum + (t.conversations?.length ?? 0), 0) + orphanConversations.length,
            totalBytes: planTasks.reduce((sum, t) => sum + t.size + sumSizes(t.conversations), 0) + sumSizes(orphanConversations),
        };
    }

    /**
     * Delete exactly the entries of a clean plan. Each deletion is independent:
     * a failure is logged and counted, and the remaining entries are still processed.
     */
    async executeCleanPlan(plan: CleanPlan): Promise<CleanResult> {
        const result: CleanResult = { deletedCount: 0, deletedConversationCount: 0, freedBytes: 0, failedCount: 0 };

        for (const task of plan.tasks) {
            const taskPath = path.join(this.baseBrainDir, task.id);
            if (!this.isValidId(task.id) || !taskPath.startsWith(this.baseBrainDir + path.sep)) {
                result.failedCount++;
                errorLog(`Cache clean: refused invalid task entry ${JSON.stringify(task.id)}`);
                continue;
            }
            try {
                await fs.promises.rm(taskPath, { recursive: true });
                result.deletedCount++;
                result.freedBytes += task.size;
            } catch (err) {
                // Already gone: not counted as deleted, but its planned conversation files are still deleted (the user confirmed the plan)
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                    result.failedCount++;
                    errorLog(`Cache clean: failed to delete task ${task.id}`, err);
                    continue;
                }
            }
            if (task.conversations) {
                await this.removeConversationFiles(task.conversations, result);
            }
        }

        await this.removeConversationFiles(plan.orphanConversations, result);

        return result;
    }

    /**
     * Clean cache by removing the least recently active tasks and old orphan conversation files
     * @param keepCount Number of most recently active tasks (and newest orphan conversations) to keep (default: 5)
     */
    async cleanCache(keepCount: number = 5): Promise<CleanResult> {
        return this.executeCleanPlan(await this.getCleanPlan(keepCount));
    }

    // ==================== Helper Methods ====================

    /**
     * Latest activity of a brain task: newest mtime among its files (recursive, bounded depth,
     * symlinks skipped) and its conversation .pb / .db / .db-wal / .db-shm; falls back to the creation time.
     */
    private async getTaskActivity(task: BrainTask): Promise<number> {
        const [filesMtime, conversationFiles] = await Promise.all([
            this.getLatestFileMtime(path.join(this.baseBrainDir, task.id)),
            this.getConversationFiles(task.id),
        ]);
        const latest = Math.max(filesMtime, ...conversationFiles.map(f => f.mtime));
        return latest || task.createdAt;
    }

    private async getLatestFileMtime(dirPath: string, maxDepth = 5): Promise<number> {
        if (maxDepth <= 0) return 0;
        let latest = 0;
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isSymbolicLink()) continue;
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isFile()) {
                    latest = Math.max(latest, (await this.statFile(fullPath))?.mtime ?? 0);
                } else if (entry.isDirectory()) {
                    latest = Math.max(latest, await this.getLatestFileMtime(fullPath, maxDepth - 1));
                }
            }
        } catch { /* unreadable directory: no activity info */ }
        return latest;
    }

    /** Existing conversation files of one conversation, in CONVERSATION_EXTENSIONS order */
    private async getConversationFiles(id: string): Promise<ConversationFile[]> {
        const files = await Promise.all(CONVERSATION_EXTENSIONS.map(ext =>
            this.statFile(path.join(this.baseConversationsDir, `${id}${ext}`))));
        return files.filter((f): f is ConversationFile => f !== undefined);
    }

    /** Regular file size and mtime, or undefined if missing or not a regular file */
    private async statFile(filePath: string): Promise<ConversationFile | undefined> {
        try {
            const stat = await fs.promises.lstat(filePath);
            return stat.isFile() ? { path: filePath, size: stat.size, mtime: stat.mtimeMs } : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Conversations (UUID-named conversation files) that have no brain/<id> directory, with their files
     * and newest mtime. Only a confirmed ENOENT counts as missing, so a brain read error never turns a
     * task's conversation into an orphan.
     */
    private async getOrphanConversations(): Promise<{ files: ConversationFile[]; mtime: number }[]> {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(this.baseConversationsDir, { withFileTypes: true });
        } catch {
            return [];
        }
        const ids = new Set<string>();
        for (const entry of entries) {
            const id = entry.isFile() ? CONVERSATION_FILE_PATTERN.exec(entry.name)?.[1] : undefined;
            if (id && UUID_PATTERN.test(id)) ids.add(id);
        }
        const orphans: { files: ConversationFile[]; mtime: number }[] = [];
        for (const id of ids) {
            try {
                await fs.promises.stat(path.join(this.baseBrainDir, id));
                continue; // brain task exists (or a non-directory entry of that name): not an orphan
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') continue;
            }
            const files = await this.getConversationFiles(id);
            if (files.length > 0) orphans.push({ files, mtime: Math.max(...files.map(f => f.mtime)) });
        }
        return orphans;
    }

    /**
     * Delete planned conversation files, recording the outcomes in result. When a .db cannot be
     * deleted, its -wal / -shm are kept and counted as failed: they may hold data not yet in the .db.
     */
    private async removeConversationFiles(files: CleanPlanFile[], result: CleanResult): Promise<void> {
        const keptDatabases = new Set<string>();
        for (const file of files) {
            const resolvedPath = path.resolve(file.path);
            const match = CONVERSATION_FILE_PATTERN.exec(path.basename(resolvedPath));
            if (!resolvedPath.startsWith(this.baseConversationsDir + path.sep) || !match) {
                result.failedCount++;
                errorLog(`Cache clean: refused file outside conversations or not a conversation file: ${file.path}`);
                continue;
            }
            const [, id, ext] = match;
            if ((ext === '.db-wal' || ext === '.db-shm') && keptDatabases.has(id)) {
                result.failedCount++;
                errorLog(`Cache clean: kept ${path.basename(resolvedPath)} because ${id}.db could not be deleted`);
                continue;
            }
            try {
                await fs.promises.rm(resolvedPath);
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
                if (ext === '.db') keptDatabases.add(id);
                result.failedCount++;
                errorLog(`Cache clean: failed to delete ${path.basename(resolvedPath)}`, err);
                continue;
            }
            result.deletedConversationCount++;
            result.freedBytes += file.size;
        }
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
                    try {
                        const fileStat = await fs.promises.stat(fullPath);
                        totalSize += fileStat.size;
                    } catch { /* skip files that vanish or cannot be read */ }
                }
            }

            return totalSize;
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

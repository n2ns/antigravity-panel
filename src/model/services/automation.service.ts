import * as vscode from 'vscode';
import { IAutomationService } from './interfaces';
import { Scheduler } from '../../shared/utils/scheduler';
import { infoLog } from '../../shared/utils/logger';

/**
 * AutomationService: Implements the hands-free auto-accept feature
 */
export class AutomationService implements IAutomationService, vscode.Disposable {
    private scheduler: Scheduler;
    private readonly taskName = 'autoAccept';
    private _enabled = false;

    constructor() {
        this.scheduler = new Scheduler({
            onError: (_name, _err) => {
                // Silently ignore command failures as they often fail when no step is pending
            }
        });

        this.scheduler.register({
            name: this.taskName,
            interval: 800, // Slightly slower than 500ms to be less aggressive but still responsive
            execute: async () => {
                if (!this._enabled) return;

                // Try to accept agent steps and terminal commands
                try {
                    // These commands are registered by the Antigravity core extension
                    await vscode.commands.executeCommand('antigravity.agent.acceptAgentStep');
                } catch {
                    // Ignore expected failures
                }

                try {
                    await vscode.commands.executeCommand('antigravity.terminal.accept');
                } catch {
                    // Ignore expected failures
                }
            },
            immediate: false
        });
    }

    start(): void {
        if (this._enabled) return;
        this._enabled = true;
        this.scheduler.start(this.taskName);
        infoLog("Automation: Auto-accept enabled");
    }

    stop(): void {
        if (!this._enabled) return;
        this._enabled = false;
        this.scheduler.stop(this.taskName);
        infoLog("Automation: Auto-accept disabled");
    }

    isRunning(): boolean {
        return this._enabled && this.scheduler.isRunning(this.taskName);
    }

    toggle(): boolean {
        if (this._enabled) {
            this.stop();
        } else {
            this.start();
        }
        return this._enabled;
    }

    updateInterval(ms: number): void {
        this.scheduler.updateInterval(this.taskName, ms);
    }

    dispose(): void {
        this.scheduler.dispose();
    }
}

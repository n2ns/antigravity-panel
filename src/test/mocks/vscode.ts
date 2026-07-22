/**
 * Mock vscode module for unit tests
 * 
 * This allows tests to run in pure Node.js environment without VS Code Extension Host
 */

export interface Disposable {
  dispose(): void;
}

export interface OutputChannel extends Disposable {
  appendLine(value: string): void;
  show(preserveFocus?: boolean): void;
}

class MockOutputChannel implements OutputChannel {
  private lines: string[] = [];

  appendLine(value: string): void {
    this.lines.push(value);
  }

  show(_preserveFocus?: boolean): void {
    // No-op in test environment
  }

  dispose(): void {
    this.lines = [];
  }

  // Test helper
  getLines(): string[] {
    return this.lines;
  }
}

export class EventEmitter<T> implements Disposable {
  private listeners: ((e: T) => any)[] = [];

  event = (listener: (e: T) => any): Disposable => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      }
    };
  };

  fire(data: T): void {
    this.listeners.forEach(l => l(data));
  }

  dispose(): void {
    this.listeners = [];
  }
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export const window = {
  createOutputChannel(name: string): OutputChannel {
    return new MockOutputChannel();
  },
  createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): any {
    return {
      text: '',
      tooltip: '',
      show: () => { },
      hide: () => { },
      dispose: () => { },
      backgroundColor: undefined,
      command: undefined
    };
  },
  showInformationMessage(message: string, ...items: any[]): Thenable<any> {
    (window as any).lastInfoMessage = message;
    (window as any).lastMessageItems = items;
    return Promise.resolve((window as any).nextMessageSelection);
  },
  showWarningMessage(message: string, ...items: any[]): Thenable<any> {
    (window as any).lastWarningMessage = message;
    (window as any).lastMessageItems = items;
    return Promise.resolve((window as any).nextMessageSelection);
  },
  showErrorMessage(message: string, ...items: any[]): Thenable<any> {
    (window as any).lastMessageItems = items;
    return Promise.resolve((window as any).nextMessageSelection);
  },
  lastMessageItems: [] as any[],
  lastInfoMessage: undefined as string | undefined,
  lastWarningMessage: undefined as string | undefined,
  nextMessageSelection: undefined as any,
  onDidChangeWindowState: (_listener: (e: { focused: boolean }) => void) => ({ dispose: () => { } }),
  state: { focused: true }
};

export const commands = {
  executeCommand: (command: string, ...rest: any[]) => {
    (commands as any).lastExecutedCommand = command;
    (commands as any).lastExecutedArgs = rest;
    return Promise.resolve();
  },
  getCommands: (_filterInternal?: boolean): Thenable<string[]> => {
    return Promise.resolve((commands as any).registeredCommands ?? []);
  },
  registeredCommands: [] as string[],
  lastExecutedCommand: undefined as string | undefined,
  lastExecutedArgs: [] as any[]
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class TreeItem {
  constructor(
    public readonly label: string | { label: string; highlights?: [number, number][] },
    public readonly collapsibleState?: TreeItemCollapsibleState
  ) { }
  iconPath?: string | { light: string; dark: string };
  contextValue?: string;
  command?: { title: string; command: string; arguments?: any[] };
}

export const ThemeColor = class {
  constructor(public id: string) { }
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, path }),
  parse: (path: string) => ({ fsPath: path, path })
};

export const env = {
  clipboard: {
    writeText: (text: string) => Promise.resolve()
  }
};

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue?: any) => defaultValue,
    update: (key: string, value: any) => Promise.resolve()
  }),
  onDidChangeTextDocument: (_listener: (e: unknown) => void) => ({ dispose: () => { } })
};

export const l10n = {
  t: (options: string | { message: string }) => {
    if (typeof options === 'string') return options;
    return options.message;
  }
};

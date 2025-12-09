/**
 * Mock vscode module for unit tests
 * 
 * This allows tests to run in pure Node.js environment without VS Code Extension Host
 */

export interface OutputChannel {
  appendLine(value: string): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
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

export const window = {
  createOutputChannel(name: string): OutputChannel {
    return new MockOutputChannel();
  }
};


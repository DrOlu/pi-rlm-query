declare module "@mariozechner/pi-coding-agent" {
  export interface ToolContext {
    sessionId: string;
    // Add other context properties as needed
  }

  export interface Tool {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
    execute(context: ToolContext, params: any): Promise<any>;
  }

  export interface ExtensionCommandContext {
    ui: {
      notify(message: string, type?: "info" | "warning" | "error" | "success"): void;
      select(title: string, options: any[], opts?: any): Promise<any>;
      confirm(title: string, message: string, opts?: any): Promise<boolean>;
      input(title: string, placeholder?: string, opts?: any): Promise<string | undefined>;
      setStatus(key: string, text: string | undefined): void;
    };
    sessionManager: any;
    model: any;
    providerConfig: any;
    workingDirectory: string;
    waitForIdle(): Promise<void>;
    newSession(options?: any): Promise<{ cancelled: boolean }>;
    fork(entryId: string): Promise<{ cancelled: boolean }>;
    navigateTree(targetId: string, options?: any): Promise<{ cancelled: boolean }>;
    switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
    reload(): Promise<void>;
  }

  export interface ExtensionAPI {
    registerTool(tool: Tool): void;
    registerCommand(name: string, options: {
      description?: string;
      getArgumentCompletions?: (argumentPrefix: string) => any[] | null;
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    }): void;
  }
}

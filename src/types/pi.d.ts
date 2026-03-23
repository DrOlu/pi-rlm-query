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

  export interface ExtensionAPI {
    registerTool(tool: Tool): void;
    registerCommand(command: {
      name: string;
      description: string;
      execute: (context: ToolContext, args: string[]) => Promise<any>;
    }): void;
  }
}

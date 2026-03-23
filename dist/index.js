"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Default configuration
const DEFAULT_CONFIG = {
    MAX_DEPTH: 3,
    BUDGET: 0.50, // $0.50 default budget
    MAX_CALLS: 20,
    TIMEOUT: 300, // 5 minutes
    MODEL: "claude-sonnet-4",
    PROVIDER: "anthropic"
};
// State stored per pi session
const sessionStates = new Map();
function default_1(pi) {
    // Initialize or get RLM state for this session
    function getState(sessionId) {
        if (!sessionStates.has(sessionId)) {
            sessionStates.set(sessionId, {
                depth: 0,
                maxDepth: parseInt(process.env.RLM_MAX_DEPTH || String(DEFAULT_CONFIG.MAX_DEPTH)),
                budget: parseFloat(process.env.RLM_BUDGET || String(DEFAULT_CONFIG.BUDGET)),
                spent: 0,
                callCount: 0,
                maxCalls: parseInt(process.env.RLM_MAX_CALLS || String(DEFAULT_CONFIG.MAX_CALLS)),
                timeout: parseInt(process.env.RLM_TIMEOUT || String(DEFAULT_CONFIG.TIMEOUT)),
                startTime: Date.now(),
                sessionDir: path.join(os.homedir(), ".pi", "agent", "sessions")
            });
        }
        return sessionStates.get(sessionId);
    }
    // Tool: rlm_query - The recursive query function
    const rlmQueryTool = {
        name: "rlm_query",
        description: `Recursively delegate a task to a child pi agent. 

Use this when:
- A task is too large for your current context window
- You need to work on a subset of files in isolation
- You want parallel processing of independent subtasks
- You need a fresh context for a sub-problem

The child agent gets:
- Fresh context window (empty conversation history)
- Isolated workspace (via temp directory)
- Same capabilities as parent (bash, read, write, edit)
- Cannot spawn more children if at max depth

Guardrails are enforced automatically:
- Depth limit (default: 3 levels)
- Budget tracking (default: $0.50 total)
- Call count limit (default: 20 calls)
- Timeout (default: 5 minutes per call)

Usage: Pass a clear, specific task description. The child will execute and return results.`,
        parameters: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description: "The specific task to delegate to the child agent. Be clear and specific about what the child should do."
                },
                context: {
                    type: "string",
                    description: "Optional context to pass to the child (file contents, code snippets, etc.). Use this to give the child relevant data without them having to search."
                },
                files: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional list of file paths the child should work with. These will be made available in the child's workspace."
                },
                timeout: {
                    type: "number",
                    description: "Optional override for timeout in seconds (default: 60)"
                }
            },
            required: ["task"]
        },
        async execute(context, params) {
            const state = getState(context.sessionId);
            // Check guardrails
            if (state.depth >= state.maxDepth) {
                return {
                    error: `Maximum recursion depth (${state.maxDepth}) reached. Cannot spawn more child agents.`,
                    depth: state.depth,
                    maxDepth: state.maxDepth
                };
            }
            if (state.callCount >= state.maxCalls) {
                return {
                    error: `Maximum call count (${state.maxCalls}) reached. Budget protection triggered.`,
                    callCount: state.callCount,
                    maxCalls: state.maxCalls
                };
            }
            if (state.spent >= state.budget) {
                return {
                    error: `Budget exhausted ($${state.spent.toFixed(4)} / $${state.budget}). Cannot make more calls.`,
                    spent: state.spent,
                    budget: state.budget
                };
            }
            const elapsed = (Date.now() - state.startTime) / 1000;
            if (elapsed >= state.timeout) {
                return {
                    error: `Timeout reached (${elapsed.toFixed(0)}s / ${state.timeout}s). Session expired.`,
                    elapsed,
                    timeout: state.timeout
                };
            }
            // Create isolated workspace for child
            const childWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-rlm-"));
            // Copy context file if provided
            let contextPath = null;
            if (params.context) {
                contextPath = path.join(childWorkspace, "CONTEXT");
                fs.writeFileSync(contextPath, params.context);
            }
            // Copy specified files to workspace
            if (params.files && Array.isArray(params.files)) {
                for (const filePath of params.files) {
                    if (fs.existsSync(filePath)) {
                        const destPath = path.join(childWorkspace, path.basename(filePath));
                        fs.copyFileSync(filePath, destPath);
                    }
                }
            }
            // Increment counters
            state.callCount++;
            state.depth++;
            // Build the system prompt for child
            const childSystemPrompt = buildChildSystemPrompt(state.depth, state.maxDepth, params.task);
            // Create temp file for system prompt
            const systemPromptPath = path.join(childWorkspace, "SYSTEM_PROMPT.txt");
            fs.writeFileSync(systemPromptPath, childSystemPrompt);
            try {
                // Spawn child pi process
                const childTimeout = params.timeout || 60;
                const result = await spawnChildPi(params.task, childWorkspace, systemPromptPath, contextPath, childTimeout, state);
                // Decrement depth counter
                state.depth--;
                // Track cost if available in result
                if (result.cost) {
                    state.spent += result.cost;
                }
                // Cleanup workspace
                cleanupWorkspace(childWorkspace);
                return {
                    success: true,
                    result: result.output,
                    depth: state.depth,
                    callCount: state.callCount,
                    spent: state.spent.toFixed(4),
                    budget: state.budget.toFixed(2),
                    workspace: childWorkspace
                };
            }
            catch (error) {
                state.depth--;
                cleanupWorkspace(childWorkspace);
                return {
                    error: `Child agent failed: ${error}`,
                    depth: state.depth,
                    callCount: state.callCount
                };
            }
        }
    };
    // Tool: rlm_cost - Check current budget status
    const rlmCostTool = {
        name: "rlm_cost",
        description: "Check the current RLM budget status - how much has been spent and how much remains.",
        parameters: {
            type: "object",
            properties: {
                format: {
                    type: "string",
                    enum: ["simple", "json"],
                    description: "Output format - simple string or detailed JSON"
                }
            }
        },
        async execute(context, params) {
            const state = getState(context.sessionId);
            const remaining = state.budget - state.spent;
            if (params.format === "json") {
                return {
                    cost: state.spent,
                    budget: state.budget,
                    remaining: remaining,
                    percentage: ((state.spent / state.budget) * 100).toFixed(1),
                    calls: state.callCount,
                    maxCalls: state.maxCalls,
                    depth: state.depth,
                    maxDepth: state.maxDepth
                };
            }
            return `$${state.spent.toFixed(4)} spent / $${state.budget.toFixed(2)} budget (${((state.spent / state.budget) * 100).toFixed(1)}%)`;
        }
    };
    // Tool: rlm_status - Show full recursion status
    const rlmStatusTool = {
        name: "rlm_status",
        description: "Show complete RLM system status including depth, budget, calls, and timeout info.",
        parameters: {
            type: "object",
            properties: {}
        },
        async execute(context) {
            const state = getState(context.sessionId);
            const elapsed = (Date.now() - state.startTime) / 1000;
            return {
                depth: {
                    current: state.depth,
                    max: state.maxDepth,
                    available: state.maxDepth - state.depth
                },
                budget: {
                    spent: state.spent.toFixed(4),
                    total: state.budget.toFixed(2),
                    remaining: (state.budget - state.spent).toFixed(4)
                },
                calls: {
                    used: state.callCount,
                    max: state.maxCalls,
                    remaining: state.maxCalls - state.callCount
                },
                timeout: {
                    elapsed: Math.floor(elapsed),
                    total: state.timeout,
                    remaining: Math.max(0, state.timeout - elapsed)
                },
                healthy: state.depth < state.maxDepth &&
                    state.callCount < state.maxCalls &&
                    state.spent < state.budget &&
                    elapsed < state.timeout
            };
        }
    };
    // Register the tools
    pi.registerTool(rlmQueryTool);
    pi.registerTool(rlmCostTool);
    pi.registerTool(rlmStatusTool);
    // Register a command to configure RLM settings
    pi.registerCommand({
        name: "rlm-config",
        description: "Configure RLM guardrail settings (depth, budget, timeout, model)",
        execute: async (context, args) => {
            const state = getState(context.sessionId);
            if (args.length < 2) {
                return `Current RLM Configuration:
  Max Depth: ${state.maxDepth}
  Budget: $${state.budget}
  Max Calls: ${state.maxCalls}
  Timeout: ${state.timeout}s
  Model: ${process.env.RLM_MODEL || DEFAULT_CONFIG.MODEL}
  
Usage: /rlm-config <setting> <value>
Settings: depth, budget, calls, timeout, model`;
            }
            const [setting, value] = args;
            switch (setting) {
                case "depth":
                    state.maxDepth = parseInt(value);
                    return `Max depth set to ${state.maxDepth}`;
                case "budget":
                    state.budget = parseFloat(value);
                    return `Budget set to $${state.budget}`;
                case "calls":
                    state.maxCalls = parseInt(value);
                    return `Max calls set to ${state.maxCalls}`;
                case "timeout":
                    state.timeout = parseInt(value);
                    return `Timeout set to ${state.timeout}s`;
                case "model":
                    process.env.RLM_MODEL = value;
                    return `Child model set to ${value}`;
                default:
                    return `Unknown setting: ${setting}. Use: depth, budget, calls, timeout, model`;
            }
        }
    });
    console.log("[pi-rlm-query] Extension loaded - rlm_query, rlm_cost, rlm_status tools registered");
}
// Helper: Build system prompt for child agent
function buildChildSystemPrompt(depth, maxDepth, parentTask) {
    const remainingDepth = maxDepth - depth;
    return `You are a recursive LLM agent at depth ${depth} of ${maxDepth}.

Your parent agent delegated this task to you:
"${parentTask}"

CONTEXT WINDOW MANAGEMENT:
- Your context window is finite. Use it wisely.
- Read files with specific line ranges: head -n 50 file.txt or sed -n '100,200p' file.txt
- Search before reading: grep -n "pattern" *.py | head -20
- Delegate further ONLY if necessary and if depth allows.

${remainingDepth > 0 ? `RECURSION AVAILABLE:
- You can use rlm_query to spawn children (${remainingDepth} levels remaining)
- Only delegate if task is genuinely too large for your context
- Prefer direct action over delegation at deeper levels` : `NO RECURSION:
- You are at MAX DEPTH - cannot spawn children
- Complete this task directly using available tools`}

COST AWARENESS:
- Be efficient. Don't read entire files if you only need sections.
- Use grep, find, and targeted commands.
- Return compact, useful results to parent.

TOOL AVAILABLE:
- rlm_query(task, context?, files?, timeout?) - delegate subtasks if needed
- rlm_cost() - check budget
- rlm_status() - check all limits

Execute the parent's task efficiently and return a clear result.`;
}
// Helper: Spawn child pi process
function spawnChildPi(task, workspace, systemPromptPath, contextPath, timeout, state) {
    return new Promise((resolve, reject) => {
        const childEnv = {
            ...process.env,
            RLM_DEPTH: String(state.depth),
            RLM_MAX_DEPTH: String(state.maxDepth),
            RLM_BUDGET: String(state.budget),
            RLM_SPENT: String(state.spent),
            RLM_TIMEOUT: String(timeout),
            RLM_MODEL: process.env.RLM_MODEL || DEFAULT_CONFIG.MODEL,
            RLM_PROVIDER: process.env.RLM_PROVIDER || DEFAULT_CONFIG.PROVIDER,
            RLM_SESSION_DIR: state.sessionDir,
            WORKSPACE: workspace
        };
        if (contextPath) {
            childEnv["CONTEXT"] = contextPath;
        }
        // Build the prompt for child
        let childPrompt = task;
        if (contextPath) {
            childPrompt = `Task: ${task}\n\nContext available at: $CONTEXT\n\nExecute the task and return a concise result.`;
        }
        // Spawn pi in print mode (-p) with system prompt
        const piPath = process.env.PI_PATH || "pi";
        const args = [
            "-p", // print mode (non-interactive)
            "--system-prompt", systemPromptPath,
            childPrompt
        ];
        const child = (0, child_process_1.spawn)(piPath, args, {
            cwd: workspace,
            env: childEnv,
            timeout: timeout * 1000,
            stdio: ["pipe", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (data) => {
            stdout += data.toString();
        });
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("close", (code) => {
            if (code === 0 || code === null) {
                // Try to extract cost from stderr if present
                const costMatch = stderr.match(/Cost: \$([0-9.]+)/);
                const cost = costMatch ? parseFloat(costMatch[1]) : undefined;
                resolve({
                    output: stdout.trim(),
                    cost
                });
            }
            else {
                reject(new Error(`Child exited with code ${code}: ${stderr}`));
            }
        });
        child.on("error", (err) => {
            reject(err);
        });
    });
}
// Helper: Cleanup workspace
function cleanupWorkspace(workspace) {
    try {
        if (fs.existsSync(workspace)) {
            fs.rmSync(workspace, { recursive: true, force: true });
        }
    }
    catch (e) {
        // Ignore cleanup errors
    }
}
//# sourceMappingURL=index.js.map
# pi-rlm-query Extension

**Recursive LLM Query extension for pi coding agent.**

Enables agent-to-agent delegation with guardrails (depth limits, budget tracking, timeouts, and workspace isolation). This brings ypi-style recursion directly into pi as a native extension.

## What It Does

This extension adds `rlm_query` to pi—a tool that allows the AI to spawn child pi agents when a task is too large for the current context window. Each child gets:

- **Fresh context window** (empty conversation history)
- **Isolated workspace** (temp directory, parent files untouched)
- **Same capabilities** (bash, read, write, edit tools)
- **Automatic guardrails** (depth, budget, calls, timeout)

## Installation

### Option 1: Install from Local Directory (Development)

```bash
# 1. Build the extension
cd pi-rlm-extension
npm install
npm run build

# 2. Install in pi
pi install /path/to/pi-rlm-extension

# Or for global install
pi install -g /path/to/pi-rlm-extension
```

### Option 2: Copy to Extensions Directory (Manual)

```bash
# Build first
npm install
npm run build

# Copy to pi extensions
mkdir -p ~/.pi/agent/extensions/pi-rlm-query
cp -r dist/* ~/.pi/agent/extensions/pi-rlm-query/
cp package.json ~/.pi/agent/extensions/pi-rlm-query/
```

### Option 3: Install from Git (Once Published)

```bash
pi install git:github.com/DrOlu/pi-rlm-query
```

## Verification

After installation, start pi and check:

```
pi
/tools  # Should show: rlm_query, rlm_cost, rlm_status
```

Or use the command:

```
/rlm-config  # Shows current settings
```

## Tools Provided

### 1. `rlm_query` - Recursive Delegation

**Purpose:** Delegate a task to a child pi agent.

**Parameters:**
- `task` (required): The specific task to delegate
- `context` (optional): Data to pass to the child (file contents, snippets)
- `files` (optional): Array of file paths to copy to child's workspace
- `timeout` (optional): Override timeout in seconds (default: 60)

**Example Usage:**

```bash
# Simple delegation
rlm_query task="Refactor the error handling in src/auth.js"

# With context
rlm_query 
  task="Fix the bug in this function"
  context="function calculateTotal(items) { return items.reduce((a,b) => a+b.price, 0); }"

# With specific files
rlm_query
  task="Update all API calls to use the new endpoint"
  files=["src/api.js", "src/utils.js"]
```

### 2. `rlm_cost` - Budget Check

**Purpose:** Check how much budget has been used.

**Parameters:**
- `format`: "simple" (default) or "json"

**Example:**

```bash
rlm_cost                    # Returns: "$0.0423 spent / $0.50 budget (8.5%)"
rlm_cost format="json"     # Returns detailed breakdown
```

### 3. `rlm_status` - Full System Status

**Purpose:** Complete status of recursion system.

**Returns:**
- Depth (current/max/available)
- Budget (spent/total/remaining)
- Calls (used/max/remaining)
- Timeout (elapsed/total/remaining)
- Health check (boolean)

## Commands

### `/rlm-config` - Configure Guardrails

View or change RLM settings:

```bash
/rlm-config                    # Show current settings
/rlm-config depth 5             # Set max depth to 5
/rlm-config budget 1.00          # Set budget to $1.00
/rlm-config calls 50            # Set max calls to 50
/rlm-config timeout 600         # Set timeout to 10 minutes
/rlm-config model claude-sonnet  # Set child model
```

## Environment Variables

Set these before starting pi to configure defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `RLM_MAX_DEPTH` | 3 | Maximum recursion depth |
| `RLM_BUDGET` | 0.50 | Total budget in dollars |
| `RLM_MAX_CALLS` | 20 | Maximum rlm_query calls |
| `RLM_TIMEOUT` | 300 | Timeout per call in seconds |
| `RLM_MODEL` | claude-sonnet-4 | Model for children |
| `RLM_PROVIDER` | anthropic | Provider for children |

**Example:**

```bash
export RLM_MAX_DEPTH=5
export RLM_BUDGET=2.00
export RLM_MODEL=gpt-4o
pi
```

## How It Works

1. **You (or the AI)** calls `rlm_query` with a task
2. **Extension checks guardrails:** depth, budget, calls, timeout
3. **Creates isolated workspace:** temp directory for child
4. **Copies files:** specified files available to child
5. **Spawns child pi:** runs `pi -p` (print mode) with system prompt
6. **Child executes:** uses tools to complete task
7. **Returns result:** child output goes back to parent
8. **Cleans up:** temp workspace deleted
9. **Updates tracking:** budget, call count, depth

## Guardrails

| Guardrail | Default | Behavior When Hit |
|-----------|---------|-------------------|
| **Depth** | 3 levels | Child cannot spawn more children |
| **Budget** | $0.50 | Returns error, no more calls allowed |
| **Calls** | 20 | Returns error, budget protection |
| **Timeout** | 60s per call | Child process killed |

## Comparison: Extension vs ypi

| Feature | ypi (Bash Wrapper) | This Extension |
|---------|-------------------|----------------|
| **Integration** | External wrapper | Native pi extension |
| **Setup** | Install separately | `pi install` |
| **Portability** | Shell-dependent | Cross-platform |
| **Performance** | Spawns bash + pi | Direct pi spawning |
| **Debugging** | Can see shell commands | Logs via pi's system |
| **Updates** | Manual | Via pi package manager |
| **Compatibility** | Works with any pi | Requires pi >= 0.60 |

## Example Workflows

### 1. Large Refactoring

```
You: "Refactor all error handling in this codebase"

Pi: "This is a large task. Let me break it down:"

rlm_query task="Find all files with error handling" 
  → Returns: ["src/auth.js", "src/api.js", "src/db.js"]

rlm_query 
  task="Refactor error handling in auth.js"
  files=["src/auth.js"]
  → Returns: Updated code

rlm_query 
  task="Refactor error handling in api.js" 
  files=["src/api.js"]
  → Returns: Updated code

rlm_query
  task="Refactor error handling in db.js"
  files=["src/db.js"]
  → Returns: Updated code

Pi: "I've refactored all error handling across 3 files."
```

### 2. Parallel Analysis

```
You: "Security audit this codebase"

Pi: "I'll run parallel security checks:"

rlm_query 
  task="Check for SQL injection vulnerabilities"
  → Result 1

rlm_query 
  task="Check for XSS vulnerabilities"
  → Result 2

rlm_query 
  task="Check for hardcoded secrets"
  → Result 3

Pi: "Combined security report: [aggregated results]"
```

### 3. Deep Research

```
You: "Analyze this 50-file codebase and suggest architecture improvements"

Pi at depth 0: "This is too large. Delegating:"
  → spawns 5 children (depth 1), each analyzes 10 files
  
Each child at depth 1: "Still large. Delegating:"
  → spawns 2 children (depth 2), each analyzes 5 files
  
Leaf children at depth 2 (max depth):
  → Analyze their 5 files directly
  → Return findings to parents
  
Parents at depth 1:
  → Aggregate their children's findings
  → Return to root

Root at depth 0:
  → Combines all findings
  → Presents architecture recommendations
```

## Troubleshooting

### Extension not loading

```bash
# Check extension is in right place
ls ~/.pi/agent/extensions/pi-rlm-query/

# Should show: index.js, package.json
```

### Tool not found

```
/tools  # Verify rlm_query is listed
```

### Child spawning fails

```bash
# Check pi is in PATH
which pi

# Or set explicitly
export PI_PATH=/usr/local/bin/pi
```

### Budget exhausted quickly

```
/rlm-config budget 5.00  # Increase budget
```

## License

MIT

## Author

Dr. Olu (Seyi Akin)

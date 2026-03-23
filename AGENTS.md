# AGENTS.md for pi-rlm-query

## Extension Purpose

This extension provides recursive LLM query capabilities to pi, enabling:
- Automatic task decomposition
- Agent-to-agent delegation
- Budget and depth guardrails
- Isolated workspace management

## Key Files

- `src/index.ts` - Main extension entry point
- `dist/index.js` - Compiled output (after `npm run build`)
- `package.json` - Extension manifest with pi configuration

## Architecture

The extension registers three tools:
1. `rlm_query` - Spawns child pi processes
2. `rlm_cost` - Budget tracking
3. `rlm_status` - System health check

And one command:
- `/rlm-config` - Interactive configuration

## Testing

```bash
# Build
npm install
npm run build

# Install locally for testing
pi install /path/to/pi-rlm-extension

# Verify
cd /tmp && pi
/tools  # Check rlm_query appears
/rlm-config  # Check configuration
```

## Development Notes

- Uses pi's ExtensionAPI
- Spawns child processes via Node.js spawn
- Manages state per session via Map
- Cleans up temp workspaces after use
- Tracks budget/calls/depth in memory (session-scoped)

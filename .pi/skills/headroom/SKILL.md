---
name: headroom
version: 1.0.0
description: Configure and use Headroom with Pi Code Agent: local proxy routing, MCP compression tools, retrieval, and stats.
---

# Headroom for Pi Code Agent

Use this when a Pi session needs to reduce context/token usage with Headroom.

## Fast path

- Manual compression/retrieval tools: add Headroom as a Pi MCP server.
- Automatic request compression: run the Headroom proxy and route Pi providers through it.
- Do not edit user-global Pi files without asking first.

## Install

```bash
pip install "headroom-ai[all]"
```

For MCP-only installs:

```bash
pip install "headroom-ai[mcp]"
```

## MCP tools in Pi

Pi's MCP adapter reads `.pi/mcp.json` as a Pi project override. Use this shape:

```json
{
  "mcpServers": {
    "headroom": {
      "command": "headroom",
      "args": ["mcp", "serve", "--proxy-url", "http://127.0.0.1:8787"]
    }
  }
}
```

Then restart Pi or run `/reload`, and call tools through the proxy MCP tool:

```js
mcp({ search: "headroom compress" })
mcp({ tool: "headroom_headroom_compress", args: '{"content":"..."}' })
```

## Automatic proxy routing

Start the proxy:

```bash
headroom proxy --port 8787
```

Route built-in Pi providers through it with `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "anthropic": { "baseUrl": "http://127.0.0.1:8787" },
    "openai": { "baseUrl": "http://127.0.0.1:8787/v1" }
  }
}
```

Keep existing provider entries and merge these keys rather than replacing the whole file.

## Verify

- `headroom doctor`
- `headroom mcp status`
- In Pi: `mcp({ search: "headroom" })`
- After proxy traffic: `headroom_stats` should show compression/retrieval counts.

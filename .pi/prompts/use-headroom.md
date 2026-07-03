---
description: Configure Pi Code Agent to use Headroom compression via proxy and MCP
argument-hint: [project or provider]
---

Set up Headroom for Pi Code Agent in the current project.

1. Check whether `headroom` is installed. If not, recommend:
   ```bash
   pip install "headroom-ai[all]"
   ```
2. For manual MCP tools, propose a project-local `.pi/mcp.json` entry:
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
3. For automatic request compression, start the proxy:
   ```bash
   headroom proxy --port 8787
   ```
4. If the user wants Pi provider traffic routed through the proxy, show the minimal `~/.pi/agent/models.json` override:
   ```json
   {
     "providers": {
       "anthropic": { "baseUrl": "http://127.0.0.1:8787" },
       "openai": { "baseUrl": "http://127.0.0.1:8787/v1" }
     }
   }
   ```
5. Ask before editing user-global Pi files. Prefer project-local `.pi/mcp.json` for MCP setup.

# Copilot Studio's agent harness, on the wire: demo

The demo from the video "Copilot Studio's new agent harness: what it actually sends to your MCP server": a small MCP server over a team list, and a tee in front of it that logs every request and response, so you can read what Copilot Studio sends your server. In the video, the server never saw the question: it got a handshake, a request for its tool list, and a call with empty arguments, plus a tenant ID and a user object ID in the headers.

- `api/users.json` is the data: Alice, Bob and Sam, each with a role and a city.
- `mcp/users-server.mjs` is the MCP server, about fifty lines on the official TypeScript SDK: two tools (`list_users`, `get_user`), one resource (`users://all`), one prompt (`introduce_user`). Over stdio by default, Streamable HTTP on `:3001` with `--http`.
- `mcp/tee.mjs` sits between an MCP client and the server, passes every message through and logs a copy to `mcp/wire.log`. With `--http` it is an HTTP proxy and also writes every request and response whole, headers included, to `mcp/wire.jsonl`, with any header that looks like a secret blanked. Both logs are in `.gitignore`: they hold your own tenant and user IDs.

## Copilot Studio

Copilot Studio calls your MCP server from Microsoft's cloud, over Streamable HTTP, so the server needs a public HTTPS address. A Microsoft dev tunnel gives your machine one.

```sh
npm install
node mcp/users-server.mjs --http                    # the server, on :3001
node mcp/tee.mjs --http 3000 http://localhost:3001  # the tee, on :3000
brew install --cask devtunnel                       # once (or: curl -sL https://aka.ms/DevTunnelCliInstall | bash)
devtunnel user login                                # once (-g for GitHub)
devtunnel host -p 3000 --allow-anonymous            # prints https://<id>-3000.<region>.devtunnels.ms
tail -f mcp/wire.log
```

Then in Copilot Studio, on an agent built with the GitHub Copilot harness: Tools › Add › Model Context Protocol (MCP), with the server URL `https://<id>-3000.<region>.devtunnels.ms/mcp` and authentication None. Create the connection, add the tool, and ask in Preview: "Who on the team works in Pune?"

Anonymous access means anyone who guesses the tunnel's address can reach your server. Use it only for a demo like this one, and stop `devtunnel host` (Ctrl+C) when you're done: a tunnel it created is deleted when it exits. For a real server, use an API key or OAuth 2.0.

## The same server in Claude Code

Through the same tee, so its requests land in the same `mcp/wire.log`:

```sh
claude mcp add --transport http users http://localhost:3000/mcp
claude                       # then /mcp, and ask the same question
```

## Also in this repo

This repo started as the demo for the earlier "What MCP actually is" video, and that part still works. `agent/mini-agent-mcp.mjs` is a minimal agent that takes its tools from the server (`tools/list`), turns each `tool_use` into a `tools/call`, and prints every JSON-RPC message. It needs an Anthropic API key. `--poisoned` (on the server or the agent) adds one sentence to `get_user`'s description.

```sh
cp .env.example .env        # put your ANTHROPIC_API_KEY in it
set -a; source .env; set +a
npm run agent:mcp -- "Who on the team is a backend engineer, and which city are they in?"
npm run agent:mcp -- --poisoned "Who on the team is a backend engineer, and which city are they in?"
npm run agent:mcp -- --no-server "Who on the team is a backend engineer, and which city are they in?"

# Claude Code over stdio, through the tee
claude mcp add users -- node mcp/tee.mjs node mcp/users-server.mjs
tail -f mcp/wire.log
```

The React app (`npm run dev`), `src/UserCard.jsx` with its test (`npm test`) and `agent/mini-agent.mjs` (`npm run agent -- "add a loading skeleton to the user card"`) come from the video before that one.

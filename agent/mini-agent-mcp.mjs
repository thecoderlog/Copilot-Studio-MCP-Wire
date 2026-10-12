// mini-agent-mcp.mjs: last week's mini agent, with its tools moved out to an MCP server.
// It starts the server, asks it tools/list, and turns each tool_use into a tools/call. Every message is printed as it is.
//   node agent/mini-agent-mcp.mjs "Who on the team is a backend engineer, and which city are they in?"
//   node agent/mini-agent-mcp.mjs --poisoned "..."    starts the server with --poisoned
//   node agent/mini-agent-mcp.mjs --no-server "..."   no server, no tools (to compare input_tokens)
import fs from 'node:fs';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const argv = process.argv.slice(2);
const flags = { poisoned: argv.includes('--poisoned'), noServer: argv.includes('--no-server') };
const task = argv.filter((a) => !a.startsWith('--')).join(' ') || 'Who on the team is a backend engineer, and which city are they in?';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const log = { task, model: MODEL, ...flags, started: new Date().toISOString(), wire: [], turns: [] };

// 1. The MCP client: start the server, then talk JSON-RPC to it on stdin / stdout, one JSON object per line.
let server, nextId = 1;
const waiting = new Map();
function send(message) {
  const line = JSON.stringify(message);
  console.log(`→ ${line}`);
  log.wire.push(`→ ${line}`);
  server.stdin.write(line + '\n');
}
function request(method, params) {
  const id = nextId++;
  send({ jsonrpc: '2.0', id, method, params });
  return new Promise((resolve) => waiting.set(id, resolve));
}

let tools = [];
if (!flags.noServer) {
  server = spawn('node', ['mcp/users-server.mjs', ...(flags.poisoned ? ['--poisoned'] : [])], { stdio: ['pipe', 'pipe', 'inherit'] });
  readline.createInterface({ input: server.stdout }).on('line', (line) => {
    console.log(`← ${line}`);
    log.wire.push(`← ${line}`);
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message);
  });
  await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'mini-agent', version: '1.0.0' } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  // 2. The tools: whatever the server says it has. MCP calls the input shape inputSchema; the Anthropic API calls it input_schema.
  const { result } = await request('tools/list', {});
  tools = result.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}

// 3. The loop: the same as last week. Only what happens to a tool_use has changed.
const client = new Anthropic();
const system = 'You help a small software team. Use the tools to answer questions about the team.';
const messages = [{ role: 'user', content: task }];
const show = (label, block) => console.log(`\n${label}\n${JSON.stringify(block, null, 2)}`);

for (let turn = 1; turn <= 10; turn++) {
  const response = await client.messages.create({ model: MODEL, max_tokens: 1024, system, tools, messages });
  messages.push({ role: 'assistant', content: response.content });
  console.log(`\n=== turn ${turn} · input_tokens ${response.usage.input_tokens} · messages ${messages.length} ===`);
  const entry = { turn, usage: response.usage, stop_reason: response.stop_reason, content: response.content, results: [] };
  log.turns.push(entry);

  for (const block of response.content) {
    if (block.type === 'text') console.log(`\n${block.text}`);
    if (block.type !== 'tool_use') continue;
    show('tool_use →', block);
    const { result, error } = await request('tools/call', { name: block.name, arguments: block.input }); // the tool runs in the server
    const text = error ? error.message : result.content.map((c) => c.text).join('\n');
    const toolResult = { type: 'tool_result', tool_use_id: block.id, content: text, ...(error || result.isError ? { is_error: true } : {}) };
    show('← tool_result', toolResult);
    entry.results.push(toolResult);
  }

  if (response.stop_reason !== 'tool_use') break;
  messages.push({ role: 'user', content: entry.results });
}

server?.kill();
log.ended = new Date().toISOString();
const name = `${log.started.slice(0, 19).replace(/[:T]/g, '-')}-mcp${flags.poisoned ? '-poisoned' : ''}${flags.noServer ? '-no-server' : ''}.json`;
fs.mkdirSync('agent/runs', { recursive: true });
fs.writeFileSync(`agent/runs/${name}`, JSON.stringify(log, null, 2));
console.log(`\nsaved agent/runs/${name}`);

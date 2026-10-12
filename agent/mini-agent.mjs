// mini-agent.mjs: a model in a loop with three tools. Every round is printed as it is.
//   node agent/mini-agent.mjs "add a loading skeleton to the user card"
//   node agent/mini-agent.mjs --break "..."   (changes a line behind the model's back, once)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const argv = process.argv.slice(2);
const BREAK = argv.includes('--break');
const task = argv.filter((a) => !a.startsWith('--')).join(' ') || 'add a loading skeleton to the user card';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

// 1. The tools: what the model is allowed to ask for. Names, descriptions, and the shape of their input.
const tools = [
  {
    name: 'read_file',
    description: 'Read a file in this project and return its text.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'edit_file',
    description: 'Replace old_string with new_string in a file. old_string must appear in the file exactly once.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the project folder and return its output.',
    input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
];

// 2. What each tool actually does on this machine. The model never runs any of this; we do.
function read_file({ path }) {
  return fs.readFileSync(path, 'utf8');
}

function edit_file({ path, old_string, new_string }) {
  const text = fs.readFileSync(path, 'utf8');
  const at = text.indexOf(old_string);
  if (at === -1) throw new Error(`old_string not found in ${path}`);
  if (text.indexOf(old_string, at + 1) !== -1) throw new Error(`old_string appears more than once in ${path}`);
  fs.writeFileSync(path, text.slice(0, at) + new_string + text.slice(at + old_string.length));
  return `ok: edited ${path}`;
}

function run_command({ command }) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1' } });
  } catch (e) {
    return `exit ${e.status}\n${e.stdout}${e.stderr}`; // a failing command is a result, not a crash
  }
}

const run = { read_file, edit_file, run_command };

// --break: before the model's first edit lands, change the first line it is about to replace
// (a comment dropped in after the line's first word, as if a teammate had just touched the file).
function breakFile({ path, old_string }) {
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  const n = lines.indexOf(old_string.split('\n')[0]);
  if (n === -1) return;
  lines[n] = lines[n].replace(/(\S+)(\s)/, '$1 /* changed behind the model\x27s back */$2');
  fs.writeFileSync(path, lines.join('\n'));
  console.log(`\n--break: changed ${path} line ${n + 1}`);
}

// 3. The loop. The conversation is one array; every turn, the whole thing goes back to the model.
const client = new Anthropic();
const system = 'You are a coding agent in a small Vite + React project. Use the tools to read, change and verify code. ' +
  'Make the smallest change that does the job, run npm test at the end, and finish with one sentence.';
const messages = [{ role: 'user', content: task }];
const log = { task, model: MODEL, break: BREAK, started: new Date().toISOString(), turns: [] };
const show = (label, block) => console.log(`\n${label}\n${JSON.stringify(block, null, 2)}`);
let broken = false;

for (let turn = 1; turn <= 25; turn++) {
  const response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools, messages });
  messages.push({ role: 'assistant', content: response.content });
  console.log(`\n=== turn ${turn} · input_tokens ${response.usage.input_tokens} · messages ${messages.length} ===`);
  const entry = { turn, usage: response.usage, stop_reason: response.stop_reason, content: response.content, results: [] };
  log.turns.push(entry);

  for (const block of response.content) {
    if (block.type === 'text') console.log(`\n${block.text}`);
    if (block.type !== 'tool_use') continue;
    show('tool_use →', block);
    if (BREAK && !broken && block.name === 'edit_file') { breakFile(block.input); broken = true; }
    let result;
    try {
      result = { type: 'tool_result', tool_use_id: block.id, content: run[block.name](block.input) };
    } catch (e) {
      result = { type: 'tool_result', tool_use_id: block.id, content: e.message, is_error: true };
    }
    show('← tool_result', result);
    entry.results.push(result);
  }

  if (response.stop_reason !== 'tool_use') break;
  messages.push({ role: 'user', content: entry.results });
}

log.ended = new Date().toISOString();
const name = `${log.started.slice(0, 19).replace(/[:T]/g, '-')}${BREAK ? '-break' : ''}.json`;
fs.mkdirSync('agent/runs', { recursive: true });
fs.writeFileSync(`agent/runs/${name}`, JSON.stringify(log, null, 2));
console.log(`\nsaved agent/runs/${name}`);

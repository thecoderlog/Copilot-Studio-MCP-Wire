// tee.mjs: sits between an MCP client and a server. Passes every message through, and logs a copy to mcp/wire.log.
//   stdio:  claude mcp add users -- node mcp/tee.mjs node mcp/users-server.mjs
//   HTTP:   node mcp/users-server.mjs --http                      (the server, on :3001)
//           node mcp/tee.mjs --http 3000 http://localhost:3001     (the tee, on :3000: point the client at http://localhost:3000/mcp)
//   tail -f mcp/wire.log
// Over HTTP it also writes mcp/wire.jsonl: every request and response whole (method, path, headers, body), one per line.
// Any header that looks like a secret (authorization, cookies, keys, tokens) is logged as "‹blanked›"; so is any such query parameter.
import fs from 'node:fs';
import http from 'node:http';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const log = fs.createWriteStream(new URL('./wire.log', import.meta.url), { flags: 'a' });
const t0 = Date.now();
const now = () => ((Date.now() - t0) / 1000).toFixed(3);

if (process.argv[2] === '--http') {
  const [port, target] = process.argv.slice(3);
  const upstream = new URL(target ?? 'http://localhost:3001');
  const full = fs.createWriteStream(new URL('./wire.jsonl', import.meta.url), { flags: 'a' });
  const SECRET = /auth|cookie|key|token|secret|signature|sig$|password|code$/i;
  const blankHeaders = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET.test(k) ? '‹blanked›' : v]));
  const blankPath = (p) => {
    const [pathname, query] = p.split('?');
    if (!query) return pathname;
    return pathname + '?' + query.split('&').map((kv) => { const k = kv.split('=')[0]; return SECRET.test(decodeURIComponent(k)) ? `${k}=‹blanked›` : kv; }).join('&');
  };
  const oneLine = (text) => { try { return JSON.stringify(JSON.parse(text)); } catch { return text.replace(/\n+/g, ' ⏎ ').trim(); } };
  const line = (arrow, text) => { const l = `${now()} ${arrow} ${text}`; log.write(l + '\n'); console.error(l); };
  let n = 0;

  http.createServer((req, res) => {
    const id = ++n;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = blankPath(req.url);
      const headers = blankHeaders(req.headers);
      line('→', `${req.method} ${path}`);
      if (body.length) line('→', oneLine(body.toString('utf8')));
      full.write(JSON.stringify({ id, dir: '→', t: Number(now()), at: new Date().toISOString(), method: req.method, path, headers, body: body.toString('utf8') }) + '\n');

      const fwd = { ...req.headers, host: upstream.host };
      delete fwd['content-length'];
      if (body.length) fwd['content-length'] = String(body.length);
      const started = Date.now();
      const up = http.request({ hostname: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: fwd }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        const stream = String(r.headers['content-type'] ?? '').startsWith('text/event-stream');
        line('←', `${r.statusCode} ${r.headers['content-type'] ?? ''}${stream ? ' (stream open)' : ''}`.trim());
        const back = [];
        r.on('data', (c) => {
          back.push(c);
          res.write(c);
          if (stream) for (const l of c.toString('utf8').split('\n')) if (l.startsWith('data:')) line('←', oneLine(l.slice(5).trim()));
        });
        r.on('close', () => {
          res.end();
          const text = Buffer.concat(back).toString('utf8');
          if (stream) line('←', `(stream closed after ${((Date.now() - started) / 1000).toFixed(1)} s)`);
          else if (text) line('←', oneLine(text));
          full.write(JSON.stringify({ id, dir: '←', t: Number(now()), at: new Date().toISOString(), status: r.statusCode, ms: Date.now() - started, headers: blankHeaders(r.headers), body: text }) + '\n');
        });
      });
      res.on('close', () => up.destroy());
      up.on('error', (e) => {
        line('✗', `${req.method} ${path}: ${e.message}`);
        res.writeHead(502).end();
      });
      up.end(body);
    });
  }).listen(Number(port ?? 3000), () => console.error(`tee: http://localhost:${port ?? 3000} → ${upstream.href}, logging to mcp/wire.log`));
} else {
  const [command, ...args] = process.argv.slice(2);
  const server = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });

  function relay(from, to, arrow) {
    readline.createInterface({ input: from }).on('line', (line) => {
      to.write(line + '\n');
      log.write(`${now()} ${arrow} ${line}\n`);
    });
  }
  relay(process.stdin, server.stdin, '→'); // client → server
  relay(server.stdout, process.stdout, '←'); // server → client
  process.stdin.on('end', () => server.stdin.end());
  server.on('exit', (code) => log.end(() => process.exit(code ?? 0)));
}

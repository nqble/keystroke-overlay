// A tiny fake "GitHub" for update tests: serves stable.json / latest.json and a throttled, correctly signed fake
// installer.
// Usage: node mock-updates.mjs <work-dir>      (the work dir holds setup-1.1.4.exe + setup-1.1.4.exe.sig)
// Set MOCK_VERSION to serve another version (the files are then setup-<version>.exe and setup-<version>.exe.sig).
import http from 'node:http';
import fs from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const version = process.env.MOCK_VERSION ?? '1.1.4';
const sig = fs.readFileSync(join(dir, `setup-${version}.exe.sig`), 'utf8').trim();
const manifest = {
  version,
  notes: '**v1.1.4**\n\n- End-to-end test update.',
  pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature: sig, url: `http://localhost:7999/setup-${version}.exe` } },
};
http
  .createServer((q, r) => {
    if (q.url === '/stable.json' || q.url === '/latest.json') {
      r.setHeader('content-type', 'application/json');
      return r.end(JSON.stringify(manifest));
    }
    if (q.url === `/setup-${version}.exe`) {
      const b = fs.readFileSync(join(dir, `setup-${version}.exe`));
      r.setHeader('content-length', b.length);
      // ~6 MB/s so progress is observable
      let o = 0;
      const next = () => {
        if (o >= b.length) return r.end();
        r.write(b.subarray(o, o + 262144));
        o += 262144;
        setTimeout(next, 40);
      };
      return next();
    }
    r.statusCode = 404;
    r.end();
  })
  .listen(7999, '127.0.0.1');

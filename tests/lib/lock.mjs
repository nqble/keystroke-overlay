// A lock shared by every test runner (end-to-end, install, benchmark). They all use the same ports (7879, 7999, 9222)
// and press real keys, so two of them at once corrupt each other. Whoever starts second waits and says who is ahead.
//
//   import { acquire } from '../lib/lock.mjs';
//   const lock = await acquire('end-to-end tests', { expectedMinutes: 12 });   // waits for its turn
//   lock.stage('suite: secure-link');                                          // optional progress note for others to
//   read
//   ...                                                                        // the lock is released automatically on
//   exit
//
//   node tests/lib/lock.mjs            show who holds the lock right now
//   node tests/lib/lock.mjs --clear    remove the lock if (and only if) its owner is gone
//
// The lock is one small JSON file in the temp folder. It is considered abandoned (and taken over, with a note) when its
// owner process no longer exists or it is older than 3 hours. Set KO_TEST_LOCK=fail to fail immediately instead of
// waiting.
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir, hostname, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';

export const LOCK_FILE = join(tmpdir(), 'keyoverlay-tests.lock.json');
const MAX_AGE_MS = 3 * 3600 * 1000,
  POLL_MS = 5000,
  REPORT_MS = 30000,
  MAX_WAIT_MS = 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'under a minute' : `${m} min`;
};

function pidAlive(pid) {
  try {
    return execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .toLowerCase()
      .includes('"node.exe"');
  } catch {
    return false;
  }
}
const read = () => {
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * The rule for taking over a lock, with the clock and the "is that process alive" answer passed in so it can be tested:
 * null while a live owner holds it, otherwise a short reason. Order matters: an unreadable file, then age, then the owner.
 */
export function staleReasonAt(l, now, ownerAlive) {
  if (!l) return 'the lock file was unreadable';
  if (now - new Date(l.started).getTime() > MAX_AGE_MS) return 'it was older than 3 hours';
  if (!ownerAlive(l.pid)) return `its owner (process ${l.pid}) is no longer running`;
  return null;
}

/** Why the lock is not usable right now: null if it is held by a live owner, otherwise a short reason. */
const staleReason = (l) => staleReasonAt(l, Date.now(), pidAlive);

/** A readable description of the current holder, for the people (and AI sessions) waiting behind it. */
export function describe(l) {
  const age = Date.now() - new Date(l.started).getTime();
  const left = l.expectedMinutes ? Math.max(1, Math.round(l.expectedMinutes - age / 60000)) : null;
  return [
    `  What:       ${l.label}${l.stage ? ` (now: ${l.stage})` : ''}`,
    `  Started:    ${hhmm(l.started)} (${ago(age)} ago)${left ? `, expected to finish in about ${left} min` : ''}`,
    `  Process:    ${l.pid} (${l.command})`,
    `  Folder:     ${l.cwd}`,
    `  Terminal:   ${l.terminal}`,
    `  To check:   node tests/lib/lock.mjs        (shows this again; it is released automatically when the run ends)`,
  ].join('\n');
}

/** What is written into the lock file: who holds it, since when, and how to find them. */
function describeSelf(label, expectedMinutes) {
  return {
    label,
    expectedMinutes,
    pid: process.pid,
    parentPid: process.ppid,
    started: new Date().toISOString(),
    stage: '',
    command: process.argv
      .slice(1)
      .map((a) => a.replace(/^.*[\\/]keyoverlay[\\/]/, ''))
      .join(' '),
    cwd: process.cwd(),
    terminal:
      process.env.TERM_PROGRAM || process.env.WT_SESSION
        ? 'Windows Terminal / shell'
        : process.env.CLAUDECODE
          ? 'a Claude Code session'
          : 'unknown',
    user: userInfo().username,
    host: hostname(),
  };
}

const writeInfo = (info) => writeFileSync(LOCK_FILE, JSON.stringify(info, null, 2));

/** Waits until the lock file can be created for `info`. Returns true if it had to wait (and said so). */
async function waitForTurn(info) {
  const t0 = Date.now();
  let lastReport = 0,
    announced = false;
  for (;;) {
    // 'wx' = create only if it does not exist (atomic)
    try {
      writeFileSync(LOCK_FILE, JSON.stringify(info, null, 2), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const l = read(),
        why = staleReason(l);
      if (why) {
        console.log(
          `[test lock] taking over an abandoned lock (${why})${l ? `: it was "${l.label}", started ${hhmm(l.started)}` : ''}`,
        );
        rmSync(LOCK_FILE, { force: true });
        continue;
      }
      if (process.env.KO_TEST_LOCK === 'fail') {
        console.error(`[test lock] another test run is in progress, and KO_TEST_LOCK=fail:
${describe(l)}`);
        process.exit(3);
      }
      if (!announced || Date.now() - lastReport > REPORT_MS) {
        console.log(
          `[test lock] waiting for another test run to finish (they share ports and the keyboard):
${describe(l)}`,
        );
        announced = true;
        lastReport = Date.now();
      }
      if (Date.now() - t0 > MAX_WAIT_MS) {
        console.error('[test lock] gave up after waiting an hour.');
        process.exit(3);
      }
      await sleep(POLL_MS);
    }
  }
  if (announced) console.log(`[test lock] it's my turn now (waited ${ago(Date.now() - t0)}).`);
  return announced;
}

/** Makes sure the lock file is removed when this process ends, however it ends; returns the handle for the caller. */
function armRelease(info) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const l = read();
    if (l && l.pid === process.pid) rmSync(LOCK_FILE, { force: true });
  };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(sig, () => {
      release();
      process.exit(130);
    });
  process.on('uncaughtException', (e) => {
    release();
    console.error(e);
    process.exit(1);
  });
  return {
    stage: (s) => {
      info.stage = s;
      if (!released) writeInfo(info);
    },
    release,
  };
}

export async function acquire(label, { expectedMinutes = 0 } = {}) {
  const info = describeSelf(label, expectedMinutes);
  await waitForTurn(info);
  return armRelease(info);
}

// ---- command line: show or clear
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const l = existsSync(LOCK_FILE) ? read() : null;
  if (!l) {
    console.log('No test run holds the lock: the tests are free to run.');
  } else {
    const why = staleReason(l);
    if (process.argv.includes('--clear')) {
      if (why) {
        rmSync(LOCK_FILE, { force: true });
        console.log(`Cleared an abandoned lock (${why}).`);
      } else console.log('Not cleared: its owner is still running.\n' + describe(l));
    } else
      console.log(
        why
          ? `A lock file exists but is abandoned (${why}); the next run will take it over.\n${describe(l)}`
          : 'A test run is in progress:\n' + describe(l),
      );
  }
}

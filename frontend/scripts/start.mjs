// Starts the production Next.js server on the port the environment asks for.
//
// Why this file exists instead of a one-liner in package.json:
//
// The script used to be `next start -p 4200`. That hardcoded port is correct
// locally (the backend owns 3000, so this app took 4200) and wrong on every
// host: a host injects its own $PORT, health-checks exactly that port, and
// marks the service unhealthy when nothing answers there. `-p 4200` overrides
// $PORT, so the deploy either fails its health check or is unreachable.
//
// `next start` already binds to $PORT when it is set, so the fix is to stop
// passing -p and supply 4200 only as the local fallback. Doing that inline
// (`next start -p ${PORT:-4200}`) would break on Windows, where npm runs
// scripts through cmd.exe and that shell syntax is passed through as a literal
// string - the port would become garbage. Hence a tiny Node script, which is
// the one thing guaranteed to behave the same on every machine.
//
// Next is spawned through its own bin resolved from node_modules rather than by
// name through a shell: no PATH lookup, no quoting rules, and signals reach the
// real child so the host's SIGTERM still shuts the server down cleanly.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The repo convention: 3000 is the backend's, so the frontend takes 4200.
// Only applied when the environment has not already chosen (i.e. locally).
process.env.PORT ||= '4200';

const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start'], {
  stdio: 'inherit',
});

// Forward the shutdown signals a host sends, so `next start` gets to close its
// connections instead of being killed along with this wrapper.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  // Re-raise rather than translate: a process killed by a signal should look
  // killed by that signal to whatever supervises it.
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
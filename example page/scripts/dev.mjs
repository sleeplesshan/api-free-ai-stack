import { spawn } from 'node:child_process';

const commands = [
  ['server', 'npm', ['run', 'dev:server']],
  ['web', 'npm', ['run', 'dev:web']]
];

const children = commands.map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { stdio: 'pipe', shell: process.platform === 'win32' });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with ${code}`);
      process.exitCode = code;
      for (const other of children) other.kill('SIGTERM');
    }
  });

  return child;
});

process.on('SIGINT', () => {
  for (const child of children) child.kill('SIGINT');
  process.exit(0);
});

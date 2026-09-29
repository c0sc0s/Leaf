import { execFileSync } from 'node:child_process';

const bump = process.argv[2];
if (!bump) throw new Error('Usage: npm run release -- <patch|minor|major|x.y.z>');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

if (git('branch', '--show-current') !== 'main') throw new Error('Releases are cut from main.');
if (git('status', '--porcelain')) {
  throw new Error('Working tree has uncommitted changes. Commit or stash them first.');
}
git('fetch', 'origin', 'main');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
  throw new Error('Local main differs from origin/main. Pull or push first.');
}

run('npm', ['test']);
run('npm', ['version', bump, '-m', 'chore: release v%s']);
run('git', ['push', 'origin', 'main', '--follow-tags']);

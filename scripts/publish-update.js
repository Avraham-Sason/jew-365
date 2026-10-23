#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const { expo } = require('../app.json');

const PAGE = 50;
const NUMBERED = /^"?\d+\.\d+\.\d+-(\d+):/;
const MESSAGE_FLAGS = ['--message', '-m'];

function nextUpdateNumber(messages) {
  const numbers = messages
    .map((message) => NUMBERED.exec(message)?.[1])
    .filter(Boolean)
    .map(Number);
  return (numbers.length ? Math.max(...numbers) : messages.length) + 1;
}

function labelMessage(args, label) {
  const at = args.findIndex((arg) => MESSAGE_FLAGS.includes(arg) || arg.startsWith('--message='));
  if (at === -1 || (!args[at].includes('=') && args[at + 1] === undefined)) {
    throw new Error('Pass --message "<what changed>"; it is stored after the update number.');
  }
  const labeled = [...args];
  if (args[at].includes('=')) labeled[at] = `--message=${label}: ${args[at].slice('--message='.length)}`;
  else labeled[at + 1] = `${label}: ${args[at + 1]}`;
  return labeled;
}

function eas(args, options = {}) {
  const [command, prefix] =
    process.platform === 'win32'
      ? [process.execPath, [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')]]
      : ['npx', []];
  return spawnSync(command, [...prefix, 'eas-cli', ...args], { encoding: 'utf8', ...options });
}

function publishedMessages(branch, runtimeVersion) {
  const messages = [];
  for (let offset = 0; ; offset += PAGE) {
    const list = eas([
      'update:list',
      '--branch',
      branch,
      '--runtime-version',
      runtimeVersion,
      '--limit',
      String(PAGE),
      '--offset',
      String(offset),
      '--json',
    ]);
    if (list.status !== 0) {
      if (/Could not find branch/.test(list.stderr)) return messages;
      throw new Error(`eas update:list failed:\n${list.stderr || list.error}`);
    }
    const page = JSON.parse(list.stdout).currentPage;
    messages.push(...page.map((update) => update.message ?? ''));
    if (page.length < PAGE) return messages;
  }
}

function main() {
  const [channel, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!channel)
    throw new Error('Usage: node scripts/publish-update.js <channel> --message "<what changed>" [eas update flags]');
  const number = nextUpdateNumber(publishedMessages(channel, expo.version));
  const label = `${expo.version}-${number}`;
  const args = labelMessage(rest, label);
  process.stdout.write(`Publishing ${label} to ${channel}\n`);
  const update = eas(['update', '--channel', channel, '--clear-cache', ...args], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_UPDATE_NUMBER: String(number) },
  });
  process.exit(update.status ?? 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { nextUpdateNumber, labelMessage };

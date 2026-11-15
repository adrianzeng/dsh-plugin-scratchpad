#!/usr/bin/env node
/**
 * One-time migration: read a Markdown export produced by the scratchpad
 * ("导出 Markdown", format documented in tests/export.test.mjs) and insert its
 * notes into the host SQLite database.
 *
 * Manual by design — this script is never called by the plugin.
 *
 *   node scripts/migrate-localstorage.mjs --file <导出的.md> [--dry-run]
 *   node scripts/migrate-localstorage.mjs --file <导出的.md> --db <notes.db>
 *
 * `--dry-run` prints how many notes would be inserted and writes nothing to
 * the database.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNoteStore, parseExportMarkdown, resolveDataDir } from '../index.js';

function parseArgs(argv) {
  const options = { file: '', db: '', dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--file' || arg === '-f') {
      i += 1;
      options.file = argv[i] || '';
    } else if (arg === '--db') {
      i += 1;
      options.db = argv[i] || '';
    } else if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg.startsWith('--db=')) {
      options.db = arg.slice('--db='.length);
    }
  }
  return options;
}

function usage() {
  console.log([
    '用法：',
    '  node scripts/migrate-localstorage.mjs --file <导出的速记.md> [--dry-run]',
    '  node scripts/migrate-localstorage.mjs --file <导出的速记.md> --db <notes.db>',
    '',
    '说明：',
    '  导出文件来自插件页脚的「导出 Markdown」。',
    '  默认数据库：' + resolveDataDir() + '\\notes.db',
    '  --dry-run 只打印将插入多少条，不写数据库。',
  ].join('\n'));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }
  if (options.file === '') {
    console.error('缺少 --file 参数。');
    usage();
    return 1;
  }

  const file = resolve(options.file);
  let markdown;
  try {
    markdown = readFileSync(file, 'utf8');
  } catch (error) {
    console.error('读不到导出文件：' + file);
    return 1;
  }

  const notes = parseExportMarkdown(markdown);
  if (notes.length === 0) {
    console.log('没有解析到便签。请确认文件是「导出 Markdown」生成的格式。');
    return 0;
  }

  const store = options.db
    ? createNoteStore({ dbPath: resolve(options.db) })
    : createNoteStore();
  try {
    const pending = notes.filter((note) => !store.has(note.id));
    if (options.dryRun) {
      console.log('dry run：将插入 ' + pending.length + ' 条（文件共 ' + notes.length + ' 条，已存在 '
        + (notes.length - pending.length) + ' 条）。');
      for (const note of pending.slice(0, 5)) {
        console.log('  - ' + note.id + ' · ' + note.text.split('\n')[0]);
      }
      if (pending.length > 5) console.log('  … 其余 ' + (pending.length - 5) + ' 条');
      return 0;
    }

    let inserted = 0;
    for (const note of notes) {
      if (store.has(note.id)) continue;
      store.create({
        id: note.id,
        text: note.text,
        remindAt: note.remindAt,
        createdAt: note.createdAt,
        status: note.status,
        doneAt: note.doneAt,
        source: 'api',
      });
      inserted += 1;
    }
    console.log('迁移完成：插入 ' + inserted + ' 条，跳过已存在 ' + (notes.length - inserted) + ' 条。');
    console.log('数据库：' + store.path);
    return 0;
  } finally {
    store.close();
  }
}

process.exitCode = main();

/**
 * Standalone checks for the time parser embedded in ../client.js.
 * Extracts the marked `time-parser` region and exercises it with a fixed clock.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const start = source.indexOf('// #region time-parser');
const end = source.indexOf('// #endregion time-parser');
assert.ok(start !== -1 && end > start, 'time-parser region markers must exist');
const region = source.slice(start, end);
const factory = new Function(region + '\nreturn { extractReminder, cnNumber, normalizeTimeText };');
const { extractReminder, cnNumber, normalizeTimeText } = factory();

const now = new Date(2026, 10, 6, 10, 0, 0, 0).getTime(); // Fri 2026-11-06 10:00 local
const at = (month, day, hour, minute) => new Date(2026, month - 1, day, hour, minute, 0, 0).getTime();

const cases = [
  { input: '明天下午3点 交周报', title: '交周报', at: at(11, 7, 15, 0) },
  { input: '30分钟后 开会', title: '开会', at: now + 30 * 60000 },
  { input: '半小时后喝水', title: '喝水', at: now + 30 * 60000 },
  { input: '2小时后 打电话', title: '打电话', at: now + 2 * 3600000 },
  { input: '十二小时后 交差', title: '交差', at: now + 12 * 3600000 },
  { input: '明天9点提醒我打卡', title: '打卡', at: at(11, 7, 9, 0) },
  { input: '提醒我 明天9点 交周报', title: '交周报', at: at(11, 7, 9, 0) },
  { input: '今晚8点 买菜', title: '买菜', at: at(11, 6, 20, 0) },
  { input: '今天下午3点 咖啡', title: '咖啡', at: at(11, 6, 15, 0) },
  { input: '明早8点 交作业', title: '交作业', at: at(11, 7, 8, 0) },
  { input: '大后天 下午 3点 开会', title: '开会', at: at(11, 9, 15, 0) },
  { input: '下周一 10:00 汇报', title: '汇报', at: at(11, 9, 10, 0) },
  { input: '下下周一 9点 启动', title: '启动', at: at(11, 16, 9, 0) },
  { input: '周五 下午2点 复盘', title: '复盘', at: at(11, 6, 14, 0) },
  { input: '周二 上午10点 例会', title: '例会', at: at(11, 10, 10, 0) },
  { input: '周三 9:00 站会', title: '站会', at: at(11, 11, 9, 0) },
  { input: '12月5日 交材料', title: '交材料', at: at(12, 5, 9, 0) },
  { input: '3天后 交报告', title: '交报告', at: now + 3 * 86400000 },
  { input: '一周后 体检', title: '体检', at: now + 7 * 86400000 },
  { input: '9点半 电话', title: '电话', at: at(11, 7, 9, 30) },
  { input: '15:30 站会', title: '站会', at: at(11, 6, 15, 30) },
  { input: '3点 取快递', title: '取快递', at: at(11, 6, 15, 0) },
  { input: '明天９点 开会', title: '开会', at: at(11, 7, 9, 0) },
  { input: '中午 吃饭', title: '吃饭', at: at(11, 6, 12, 0) },
  { input: '凌晨2点 看球', title: '看球', at: at(11, 7, 2, 0) },
  { input: '明天下午三点 开会', title: '开会', at: at(11, 7, 15, 0) },
  { input: '今晚八点 散步', title: '散步', at: at(11, 6, 20, 0) },
  { input: '两点半 电话', title: '电话', at: at(11, 6, 14, 30) },
  { input: '明天下午3点半 汇报', title: '汇报', at: at(11, 7, 15, 30) },
  { input: '三点 开会', title: '开会', at: at(11, 6, 15, 0) },
  { input: '明天 提醒我 带伞', title: '带伞', at: at(11, 7, 9, 0) },
  { input: '不提醒 随手记', title: '随手记', at: null },
  { input: '买一点水果', title: '买一点水果', at: null },
  { input: '一点小事要处理', title: '一点小事要处理', at: null },
  { input: '写完就去吃饭', title: '写完就去吃饭', at: null },
  { input: '一小时后', title: '一小时后', at: now + 3600000 },
  { input: '今晚', title: '今晚', at: at(11, 6, 20, 0) },
  { input: '明天', title: '明天', at: at(11, 7, 9, 0) },
  { input: '今天要去做一个驾驶舱出来', title: '要去做一个驾驶舱出来', at: now + 3600000 },
  { input: '今天', title: '今天', at: now + 3600000 },
];

let failed = 0;
for (const testCase of cases) {
  let result;
  try {
    result = extractReminder(testCase.input, now);
  } catch (error) {
    console.error('THROW', JSON.stringify(testCase.input), error);
    failed += 1;
    continue;
  }
  const atOk = result.remindAt === testCase.at;
  const titleOk = result.title === testCase.title;
  if (!atOk || !titleOk) {
    failed += 1;
    console.error(
      'FAIL',
      JSON.stringify(testCase.input),
      '| remindAt', result.remindAt, 'expected', testCase.at,
      '| title', JSON.stringify(result.title), 'expected', JSON.stringify(testCase.title),
    );
  }
}

assert.equal(cnNumber('十'), 10);
assert.equal(cnNumber('十五'), 15);
assert.equal(cnNumber('二十'), 20);
assert.equal(cnNumber('两'), 2);
assert.equal(normalizeTimeText('９：３０'), '9:30');

// Without an explicit clock, a day word that resolves into the past reminds one hour from now.
const lateNow = at(11, 6, 16, 0);
const latePeriod = extractReminder('今天下午 开会', lateNow);
assert.equal(latePeriod.remindAt, lateNow + 3600000);
assert.equal(latePeriod.title, '开会');
const lateExplicit = extractReminder('今天下午3点 开会', lateNow);
assert.equal(lateExplicit.remindAt, at(11, 6, 15, 0), 'an explicitly typed clock stays as typed');

if (failed > 0) {
  console.error('\n' + failed + ' case(s) failed');
  process.exit(1);
}
console.log('time parser: ' + cases.length + ' cases passed');

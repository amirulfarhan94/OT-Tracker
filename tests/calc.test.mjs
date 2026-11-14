import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  durationHours, crossesMidnight, detectDayType, calcPay, baseRates, summarize, mergeSettings,
  periodRange, periodKeyOf,
} from '../js/calc.js';

// Salary RM2,600 → ORP RM100, HRP RM12.50 (8h day, 26 days)
const S = mergeSettings({ salary: 2600 });
const HOLIDAYS = [{ date: '2026-12-25', name: 'Christmas Day' }];

test('base rates', () => {
  const { orp, hrp } = baseRates(S);
  assert.equal(orp, 100);
  assert.equal(hrp, 12.5);
});

test('duration, including overnight shifts', () => {
  assert.equal(durationHours('18:00', '21:00'), 3);
  assert.equal(durationHours('17:30', '20:15'), 2.75);
  assert.equal(durationHours('22:00', '02:00'), 4);
  assert.equal(durationHours('08:00', '08:00'), 24);
  assert.equal(durationHours('', '10:00'), 0);
  assert.equal(crossesMidnight('22:00', '02:00'), true);
  assert.equal(crossesMidnight('18:00', '21:00'), false);
});

test('day type detection', () => {
  assert.equal(detectDayType('2026-11-16', S, HOLIDAYS), 'normal'); // Monday
  assert.equal(detectDayType('2026-11-14', S, HOLIDAYS), 'off');    // Saturday
  assert.equal(detectDayType('2026-11-15', S, HOLIDAYS), 'rest');   // Sunday
  assert.equal(detectDayType('2026-12-25', S, HOLIDAYS), 'public'); // Friday, holiday
});

test('normal day: 1.5× per hour', () => {
  assert.equal(calcPay(3, 'normal', S).amount, 56.25);
});

test('off day: 1.0× up to 8h, 1.5× beyond', () => {
  assert.equal(calcPay(5, 'off', S).amount, 62.5);
  assert.equal(calcPay(8, 'off', S).amount, 100);
  assert.equal(calcPay(10, 'off', S).amount, 137.5);
});

test('rest day: ½ day / 1 day ORP, 2.0× beyond', () => {
  assert.equal(calcPay(3, 'rest', S).amount, 50);
  assert.equal(calcPay(4, 'rest', S).amount, 50);
  assert.equal(calcPay(6, 'rest', S).amount, 100);
  assert.equal(calcPay(8, 'rest', S).amount, 100);
  assert.equal(calcPay(10, 'rest', S).amount, 150);
});

test('public holiday: 2 days ORP, 3.0× beyond', () => {
  assert.equal(calcPay(2, 'public', S).amount, 200);
  assert.equal(calcPay(8, 'public', S).amount, 200);
  assert.equal(calcPay(10, 'public', S).amount, 275);
});

test('zero hours / zero salary pay nothing', () => {
  assert.equal(calcPay(0, 'rest', S).amount, 0);
  assert.equal(calcPay(5, 'normal', mergeSettings({})).amount, 0);
});

test('custom rates are respected', () => {
  const custom = mergeSettings({ salary: 2600, rates: { normal: 2 } });
  assert.equal(calcPay(2, 'normal', custom).amount, 50);
  assert.equal(custom.rates.offWithin, 1.0);
});

test('summary with override', () => {
  const entries = [
    { date: '2026-11-16', start: '18:00', end: '21:00' },                          // normal 56.25
    { date: '2026-11-14', start: '08:00', end: '18:00' },                          // off 137.5
    { date: '2026-11-17', start: '18:00', end: '20:00', dayTypeOverride: 'public' }, // 200
  ];
  const sum = summarize(entries, S, HOLIDAYS);
  assert.equal(sum.hours, 15);
  assert.equal(sum.amount, 393.75);
  assert.equal(sum.byType.off.amount, 137.5);
  assert.equal(sum.byType.public.count, 1);
});

test('pay period: calendar month when no cut-off', () => {
  assert.deepEqual(periodRange('2026-11', 0), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(periodRange('2028-02', 0), { start: '2028-02-01', end: '2028-02-29' });
  assert.equal(periodKeyOf('2026-11-25', 0), '2026-11');
});

test('pay period: cut-off day', () => {
  assert.deepEqual(periodRange('2026-11', 20), { start: '2026-10-21', end: '2026-11-20' });
  assert.deepEqual(periodRange('2027-01', 25), { start: '2026-12-26', end: '2027-01-25' });
  // cut-off 28: Feb (non-leap) period ends 28 Feb, March starts 1 Mar — no gaps
  assert.deepEqual(periodRange('2027-02', 28), { start: '2027-01-29', end: '2027-02-28' });
  assert.deepEqual(periodRange('2027-03', 28), { start: '2027-03-01', end: '2027-03-28' });
  assert.equal(periodKeyOf('2026-11-20', 20), '2026-11');
  assert.equal(periodKeyOf('2026-11-21', 20), '2026-12');
  assert.equal(periodKeyOf('2026-12-31', 20), '2027-01');
  assert.equal(periodKeyOf('2026-10-21', 20), '2026-11');
});

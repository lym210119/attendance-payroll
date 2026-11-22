import { describe, expect, it } from 'vitest';
import { buildShiftDemoTimestamps } from './shift-demo-time';

describe('buildShiftDemoTimestamps', () => {
  it('places an overnight shift, clock-out, and after-midnight break on the next date', () => {
    expect(buildShiftDemoTimestamps({
      date: '2026-11-21',
      shiftStart: '20:00',
      shiftEnd: '08:00',
      punchIn: '19:55',
      punchOut: '08:15',
      breakStart: '00:30',
      breakEnd: '02:00',
    })).toEqual({
      scheduledStart: '2026-11-21T12:00:00.000Z',
      scheduledEnd: '2026-11-22T00:00:00.000Z',
      punchIn: '2026-11-21T11:55:00.000Z',
      punchOut: '2026-11-22T00:15:00.000Z',
      breakStart: '2026-11-21T16:30:00.000Z',
      breakEnd: '2026-11-21T18:00:00.000Z',
    });
  });

  it('keeps a same-day day shift and its break on the selected date', () => {
    const result = buildShiftDemoTimestamps({
      date: '2026-11-21',
      shiftStart: '08:00',
      shiftEnd: '20:00',
      punchIn: '08:05',
      punchOut: '20:30',
      breakStart: '12:00',
      breakEnd: '13:30',
    });
    expect(result.scheduledEnd).toBe('2026-11-21T12:00:00.000Z');
    expect(result.punchOut).toBe('2026-11-21T12:30:00.000Z');
    expect(result.breakStart).toBe('2026-11-21T04:00:00.000Z');
    expect(result.breakEnd).toBe('2026-11-21T05:30:00.000Z');
  });

  it('places after-midnight clock-in and clock-out on the next date for a night shift', () => {
    expect(buildShiftDemoTimestamps({
      date: '2026-11-21',
      shiftStart: '20:00',
      shiftEnd: '08:00',
      punchIn: '01:00',
      punchOut: '08:00',
      breakStart: '01:30',
      breakEnd: '02:30',
    })).toEqual({
      scheduledStart: '2026-11-21T12:00:00.000Z',
      scheduledEnd: '2026-11-22T00:00:00.000Z',
      punchIn: '2026-11-21T17:00:00.000Z',
      punchOut: '2026-11-22T00:00:00.000Z',
      breakStart: '2026-11-21T17:30:00.000Z',
      breakEnd: '2026-11-21T18:30:00.000Z',
    });
  });

  it('rejects malformed date and time inputs', () => {
    expect(() => buildShiftDemoTimestamps({
      date: '2026/11/21',
      shiftStart: '20:00',
      shiftEnd: '08:00',
      punchIn: '19:55',
      punchOut: '08:15',
      breakStart: '00:30',
      breakEnd: '02:00',
    })).toThrow('日期或时间格式无效');
    expect(() => buildShiftDemoTimestamps({
      date: '2026-02-31',
      shiftStart: '08:00',
      shiftEnd: '20:00',
      punchIn: '08:00',
      punchOut: '20:00',
      breakStart: '12:00',
      breakEnd: '13:00',
    })).toThrow('日期或时间格式无效');
  });
});

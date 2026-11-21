import { describe, expect, it } from 'vitest';
import { calculateAttendance } from './attendance-engine';

const policy = { fullShiftUnpaidBreakMinutes: 90, requireOvertimeApproval: true };
const punch = (type: 'in' | 'out', at: string) => ({ type, at, evidenceId: type + at });

describe('calculateAttendance', () => {
  it('handles an overnight shift and separates approved overtime', () => {
    const result = calculateAttendance({
      scheduledStart: '2026-11-20T20:00:00+08:00',
      scheduledEnd: '2026-11-21T08:00:00+08:00',
      punches: [punch('in', '2026-11-20T19:50:00+08:00'), punch('out', '2026-11-21T09:00:00+08:00')],
      approvedOvertime: false, policy,
    });
    expect(result.scheduledMinutes).toBe(720);
    expect(result.regularMinutes).toBe(630);
    expect(result.requestedOvertimeMinutes).toBe(60);
    expect(result.approvedOvertimeMinutes).toBe(0);
    expect(result.unpaidOvertimeMinutes).toBe(60);
  });

  it('does not count early arrival as payable time', () => {
    const result = calculateAttendance({
      scheduledStart: '2026-11-21T08:00:00+08:00',
      scheduledEnd: '2026-11-21T20:00:00+08:00',
      punches: [punch('in', '2026-11-21T07:00:00+08:00'), punch('out', '2026-11-21T20:00:00+08:00')],
      policy,
    });
    expect(result.regularMinutes).toBe(630);
    expect(result.lateMinutes).toBe(0);
  });

  it('deducts actual break time for a partial shift', () => {
    const result = calculateAttendance({
      scheduledStart: '2026-11-21T08:00:00+08:00',
      scheduledEnd: '2026-11-21T20:00:00+08:00',
      punches: [punch('in', '2026-11-21T10:00:00+08:00'), punch('out', '2026-11-21T18:00:00+08:00')],
      breaks: [{ start: '2026-11-21T13:00:00+08:00', end: '2026-11-21T13:30:00+08:00' }],
      policy,
    });
    expect(result.unpaidBreakMinutes).toBe(30);
    expect(result.regularMinutes).toBe(450);
  });

  it('requires explicit approval for overtime', () => {
    const result = calculateAttendance({
      scheduledStart: '2026-11-21T08:00:00+08:00',
      scheduledEnd: '2026-11-21T16:00:00+08:00',
      punches: [punch('in', '2026-11-21T08:00:00+08:00'), punch('out', '2026-11-21T18:00:00+08:00')],
      approvedOvertime: true, policy,
    });
    expect(result.approvedOvertimeMinutes).toBe(120);
  });

  it('rejects timestamps without an explicit timezone', () => {
    expect(() => calculateAttendance({
      scheduledStart: '2026-11-21T08:00:00',
      scheduledEnd: '2026-11-21T20:00:00Z',
      punches: [], policy,
    })).toThrow(/时区/);
  });

  it('flags missing clock-out instead of silently completing the shift', () => {
    const result = calculateAttendance({
      scheduledStart: '2026-11-21T08:00:00Z',
      scheduledEnd: '2026-11-21T20:00:00Z',
      punches: [punch('in', '2026-11-21T08:05:00Z')], policy,
    });
    expect(result.status).toBe('missing_out');
    expect(result.missingPunch).toBe(true);
    expect(result.requestedOvertimeMinutes).toBe(0);
    expect(Number.isFinite(result.regularMinutes)).toBe(true);
  });
});

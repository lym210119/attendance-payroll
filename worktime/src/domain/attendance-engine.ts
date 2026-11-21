export type PunchType = 'in' | 'out';
export type Punch = { type: PunchType; at: string; evidenceId: string };
export type BreakInterval = { start: string; end: string };
export type AttendancePolicy = {
  /** Deduct this many unpaid minutes when attendance reaches the full-shift threshold. */
  fullShiftUnpaidBreakMinutes: number;
  /** Minimum attended minutes that qualifies as a full shift. Defaults to scheduled elapsed minutes. */
  fullShiftThresholdMinutes?: number;
  /** Whether overtime after scheduled end is payable only after explicit approval. */
  requireOvertimeApproval: boolean;
  /** Grace periods affect status only; they do not create payable minutes. */
  lateGraceMinutes?: number;
  earlyLeaveGraceMinutes?: number;
};
export type AttendanceInput = {
  scheduledStart: string;
  scheduledEnd: string;
  punches: Punch[];
  breaks?: BreakInterval[];
  approvedOvertime?: boolean;
  policy: AttendancePolicy;
};
export type AttendanceResult = {
  status: 'complete' | 'late' | 'early_leave' | 'late_and_early_leave' | 'missing_in' | 'missing_out' | 'missing_both';
  scheduledMinutes: number;
  attendedMinutes: number;
  unpaidBreakMinutes: number;
  regularMinutes: number;
  requestedOvertimeMinutes: number;
  approvedOvertimeMinutes: number;
  unpaidOvertimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  missingPunch: boolean;
};

const MINUTE = 60_000;
const toEpoch = (value: string): number => {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('时间必须包含明确的时区偏移或 Z');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('无效的 ISO 时间');
  return parsed;
};
const minutes = (milliseconds: number) => Math.floor(milliseconds / MINUTE);
const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export function calculateAttendance(input: AttendanceInput): AttendanceResult {
  const start = toEpoch(input.scheduledStart);
  const end = toEpoch(input.scheduledEnd);
  if (end <= start) throw new Error('班次结束时间必须晚于开始时间');
  if (!Number.isInteger(input.policy.fullShiftUnpaidBreakMinutes) || input.policy.fullShiftUnpaidBreakMinutes < 0) {
    throw new Error('固定休息扣除分钟数必须是非负整数');
  }

  const events = input.punches.map(p => ({ ...p, epoch: toEpoch(p.at) }))
    .sort((a, b) => a.epoch - b.epoch);
  if (events.some(e => !e.evidenceId.trim())) throw new Error('每条打卡证据必须有 evidenceId');
  for (let i = 1; i < events.length; i++) {
    if (events[i].epoch === events[i - 1].epoch) throw new Error('打卡时间不能重复');
  }

  let open: number | null = null;
  let firstIn: number | null = null;
  let lastOut: number | null = null;
  let missingIn = false;
  let missingOut = false;
  const work: Array<[number, number]> = [];
  for (const event of events) {
    if (event.type === 'in') {
      if (open !== null) throw new Error('连续上班打卡，缺少对应的下班打卡');
      open = event.epoch;
      firstIn ??= event.epoch;
    } else {
      if (open === null) { missingIn = true; continue; }
      if (event.epoch <= open) throw new Error('下班打卡必须晚于上班打卡');
      work.push([open, event.epoch]);
      open = null;
      lastOut = event.epoch;
    }
  }
  if (open !== null) missingOut = true;
  const missingBoth = firstIn === null && events.length === 0;
  if (open !== null) work.push([open, Number.POSITIVE_INFINITY]);

  let scheduledWorkMs = 0;
  let overtimeMs = 0;
  let attendedMs = 0;
  for (const [a, b] of work) {
    const clippedStart = Math.max(a, start);
    const clippedEnd = Math.min(b, end);
    if (clippedEnd > clippedStart) {
      scheduledWorkMs += clippedEnd - clippedStart;
      attendedMs += clippedEnd - clippedStart;
    }
    const otStart = Math.max(a, end);
    if (b > otStart) overtimeMs += b - otStart;
  }

  const breakIntervals = (input.breaks ?? []).map(br => {
    const bs = toEpoch(br.start), be = toEpoch(br.end);
    if (be <= bs) throw new Error('休息结束时间必须晚于开始时间');
    return [bs, be] as [number, number];
  });
  let actualBreakMs = 0;
  for (const [bs, be] of breakIntervals) {
    for (const [a, b] of work) actualBreakMs += overlap(a, b, bs, be);
  }
  const scheduledMinutes = minutes(end - start);
  const threshold = input.policy.fullShiftThresholdMinutes ?? scheduledMinutes;
  const isFullShift = minutes(attendedMs) >= threshold;
  const fixedBreakMs = Math.min(input.policy.fullShiftUnpaidBreakMinutes, scheduledMinutes) * MINUTE;
  const unpaidBreakMs = isFullShift ? fixedBreakMs : actualBreakMs;
  const regularMinutes = Math.max(0, minutes(Math.max(0, scheduledWorkMs - unpaidBreakMs)));
  const requestedOvertimeMinutes = minutes(overtimeMs);
  const approvedOvertimeMinutes = input.policy.requireOvertimeApproval
    ? (input.approvedOvertime ? requestedOvertimeMinutes : 0)
    : requestedOvertimeMinutes;
  const lateMinutes = firstIn === null ? 0 : Math.max(0, minutes(firstIn - start) - (input.policy.lateGraceMinutes ?? 0));
  const earlyLeaveMinutes = lastOut === null ? 0 : Math.max(0, minutes(end - lastOut) - (input.policy.earlyLeaveGraceMinutes ?? 0));

  let status: AttendanceResult['status'];
  if (missingBoth) status = 'missing_both';
  else if (missingIn) status = 'missing_in';
  else if (missingOut) status = 'missing_out';
  else if (lateMinutes > 0 && earlyLeaveMinutes > 0) status = 'late_and_early_leave';
  else if (lateMinutes > 0) status = 'late';
  else if (earlyLeaveMinutes > 0) status = 'early_leave';
  else status = 'complete';

  return {
    status,
    scheduledMinutes,
    attendedMinutes: minutes(attendedMs),
    unpaidBreakMinutes: minutes(unpaidBreakMs),
    regularMinutes,
    requestedOvertimeMinutes,
    approvedOvertimeMinutes,
    unpaidOvertimeMinutes: requestedOvertimeMinutes - approvedOvertimeMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    missingPunch: missingIn || missingOut || missingBoth,
  };
}

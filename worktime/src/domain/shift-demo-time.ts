export type ShiftDemoTimeInput = {
  date: string;
  shiftStart: string;
  shiftEnd: string;
  punchIn: string;
  punchOut: string;
  breakStart: string;
  breakEnd: string;
};

export type ShiftDemoTimestamps = {
  scheduledStart: string;
  scheduledEnd: string;
  punchIn: string;
  punchOut: string;
  breakStart: string;
  breakEnd: string;
};

const isValidTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function timestamp(date: string, time: string, dayOffset: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidTime(time)) {
    throw new Error('日期或时间格式无效');
  }
  const [year, month, day] = date.split('-').map(Number);
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  if (baseDate.getUTCFullYear() !== year || baseDate.getUTCMonth() !== month - 1 || baseDate.getUTCDate() !== day) {
    throw new Error('日期或时间格式无效');
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const localDate = [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return new Date(`${localDate}T${time}:00+08:00`).toISOString();
}

/** Build explicit Beijing-offset timestamps for the browser-only attendance demo. */
export function buildShiftDemoTimestamps(input: ShiftDemoTimeInput): ShiftDemoTimestamps {
  const overnight = input.shiftEnd <= input.shiftStart;
  const breakStartDay = overnight && input.breakStart < input.shiftStart ? 1 : 0;
  const breakEndDay = breakStartDay + (input.breakEnd <= input.breakStart ? 1 : 0);
  // In this demo only, morning clock-in times are assigned to the next date;
  // evening times remain on the shift's starting date. This resolves the
  // ambiguous 24-hour clock without changing the production attendance model.
  const punchInDay = overnight && input.punchIn < '12:00' ? 1 : 0;
  const punchOutDay = overnight
    ? (input.punchOut <= input.shiftStart ? 1 : 0)
    : (input.punchOut <= input.punchIn ? 1 : 0);

  return {
    scheduledStart: timestamp(input.date, input.shiftStart, 0),
    scheduledEnd: timestamp(input.date, input.shiftEnd, overnight ? 1 : 0),
    punchIn: timestamp(input.date, input.punchIn, punchInDay),
    punchOut: timestamp(input.date, input.punchOut, punchOutDay),
    breakStart: timestamp(input.date, input.breakStart, breakStartDay),
    breakEnd: timestamp(input.date, input.breakEnd, breakEndDay),
  };
}

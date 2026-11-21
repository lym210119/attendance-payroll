/**
 * WorkTime deterministic payroll core.
 *
 * Money is represented as integer minor units (e.g. cents); time is integer minutes.
 * This module deliberately does not decide local labor-law rules, tax, insurance,
 * holiday premiums, leave treatment, or rounding policy. Those are explicit inputs.
 */

export type PayType = 'monthly' | 'hourly' | 'daily';

export interface PayrollPolicy {
  /** Extra premium multiplier in basis points: 15000 = 1.5x total pay. */
  overtimeMultiplierBps: number;
  /** If true, only approved overtime minutes are payable. */
  requireOvertimeApproval: boolean;
}

export interface EmployeePay {
  employeeId: string;
  payType: PayType;
  /** Monthly salary, hourly rate, or daily rate in minor currency units. */
  baseRateMinor: number;
  /** Required for monthly salary proration and hourly-equivalent derivation. */
  standardPeriodMinutes?: number;
  /** Required for daily pay and daily overtime rate derivation. */
  standardDayMinutes?: number;
}

export interface AttendancePayInput {
  /** Minutes already net of unpaid breaks and other attendance adjustments. */
  regularMinutes: number;
  /** Overtime minutes approved by the employer. */
  approvedOvertimeMinutes: number;
  /** Submitted overtime minutes, including unapproved requests. */
  requestedOvertimeMinutes?: number;
  /** Number of payable workdays for daily-paid employees. */
  payableDays?: number;
}

export interface PayrollInput {
  currency: string;
  employee: EmployeePay;
  attendance: AttendancePayInput;
  policy: PayrollPolicy;
  /** Explicit fixed deductions in minor units; tax/statutory deductions are external. */
  deductionsMinor?: number;
  /** Stable identifier of the rule/configuration version used. */
  ruleVersion: string;
}

export interface PayrollResult {
  employeeId: string;
  currency: string;
  ruleVersion: string;
  payType: PayType;
  regularPayMinor: number;
  overtimePremiumMinor: number;
  grossPayMinor: number;
  deductionsMinor: number;
  netPayMinor: number;
  regularMinutes: number;
  overtimeMinutesPaid: number;
  overtimeMinutesUnpaid: number;
  payableDays: number;
  rounding: 'half-up-to-minor-unit';
}

function assertInteger(name: string, value: number, min = 0): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(name + ' must be a safe integer >= ' + min);
  }
}

/** Integer division rounded half-up; no binary floating-point money arithmetic. */
export function divideHalfUp(numerator: number, denominator: number): number {
  assertInteger('numerator', numerator);
  assertInteger('denominator', denominator, 1);
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function multiplyRate(rateMinor: number, minutes: number, denominator: number): number {
  // BigInt prevents intermediate overflow while the public API remains safe integers.
  const n = BigInt(rateMinor) * BigInt(minutes);
  const d = BigInt(denominator);
  return Number((n + d / 2n) / d);
}

function validate(input: PayrollInput): void {
  if (!input.employee.employeeId.trim()) throw new Error('employeeId is required');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('currency must be a 3-letter uppercase code');
  if (!input.ruleVersion.trim()) throw new Error('ruleVersion is required');
  assertInteger('baseRateMinor', input.employee.baseRateMinor);
  assertInteger('regularMinutes', input.attendance.regularMinutes);
  assertInteger('approvedOvertimeMinutes', input.attendance.approvedOvertimeMinutes);
  assertInteger('requestedOvertimeMinutes', input.attendance.requestedOvertimeMinutes ?? 0);
  assertInteger('payableDays', input.attendance.payableDays ?? 0);
  assertInteger('deductionsMinor', input.deductionsMinor ?? 0);
  assertInteger('overtimeMultiplierBps', input.policy.overtimeMultiplierBps, 10000);
  if (input.attendance.approvedOvertimeMinutes > (input.attendance.requestedOvertimeMinutes ?? input.attendance.approvedOvertimeMinutes)) {
    throw new RangeError('approved overtime cannot exceed requested overtime');
  }
  if (input.employee.payType === 'monthly') {
    assertInteger('standardPeriodMinutes', input.employee.standardPeriodMinutes ?? 0, 1);
  }
  if (input.employee.payType === 'daily') {
    assertInteger('standardDayMinutes', input.employee.standardDayMinutes ?? 0, 1);
  }
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  validate(input);
  const { employee, attendance, policy } = input;
  const regularMinutes = attendance.regularMinutes;
  const overtimeMinutesPaid = policy.requireOvertimeApproval
    ? attendance.approvedOvertimeMinutes
    : (attendance.requestedOvertimeMinutes ?? attendance.approvedOvertimeMinutes);
  const requested = attendance.requestedOvertimeMinutes ?? attendance.approvedOvertimeMinutes;
  const overtimeMinutesUnpaid = Math.max(0, requested - overtimeMinutesPaid);
  const payableDays = attendance.payableDays ?? 0;

  let regularPayMinor: number;
  let overtimeBaseMinor: number;

  if (employee.payType === 'monthly') {
    const periodMinutes = employee.standardPeriodMinutes!;
    regularPayMinor = multiplyRate(employee.baseRateMinor, regularMinutes, periodMinutes);
    overtimeBaseMinor = multiplyRate(employee.baseRateMinor, overtimeMinutesPaid, periodMinutes);
  } else if (employee.payType === 'hourly') {
    regularPayMinor = multiplyRate(employee.baseRateMinor, regularMinutes, 60);
    overtimeBaseMinor = multiplyRate(employee.baseRateMinor, overtimeMinutesPaid, 60);
  } else {
    const dayMinutes = employee.standardDayMinutes!;
    regularPayMinor = employee.baseRateMinor * payableDays;
    overtimeBaseMinor = multiplyRate(employee.baseRateMinor, overtimeMinutesPaid, dayMinutes);
  }

  if (!Number.isSafeInteger(regularPayMinor) || !Number.isSafeInteger(overtimeBaseMinor)) {
    throw new RangeError('calculated amount exceeds safe integer range');
  }

  // Regular pay includes overtime at the base rate; this adds only the premium portion.
  const premiumBps = policy.overtimeMultiplierBps - 10000;
  const overtimePremiumMinor = multiplyRate(overtimeBaseMinor, premiumBps, 10000);
  const grossPayMinor = regularPayMinor + overtimeBaseMinor + overtimePremiumMinor;
  const deductionsMinor = input.deductionsMinor ?? 0;
  const netPayMinor = grossPayMinor - deductionsMinor;

  for (const [name, amount] of Object.entries({ grossPayMinor, netPayMinor, overtimePremiumMinor })) {
    if (!Number.isSafeInteger(amount)) throw new RangeError(name + ' exceeds safe integer range');
  }

  return {
    employeeId: employee.employeeId,
    currency: input.currency,
    ruleVersion: input.ruleVersion,
    payType: employee.payType,
    regularPayMinor,
    overtimePremiumMinor,
    grossPayMinor,
    deductionsMinor,
    netPayMinor,
    regularMinutes,
    overtimeMinutesPaid,
    overtimeMinutesUnpaid,
    payableDays,
    rounding: 'half-up-to-minor-unit',
  };
}

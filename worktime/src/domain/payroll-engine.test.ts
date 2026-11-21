import { describe, expect, it } from 'vitest';
import { calculatePayroll } from './payroll-engine';

const policy = { overtimeMultiplierBps: 15000, requireOvertimeApproval: true };

describe('calculatePayroll', () => {
  it('prorates monthly base pay and adds only approved overtime premium', () => {
    const result = calculatePayroll({
      currency: 'CNY', ruleVersion: 'rules-2026-01', policy,
      employee: { employeeId: 'E1', payType: 'monthly', baseRateMinor: 600000, standardPeriodMinutes: 9600 },
      attendance: { regularMinutes: 9600, requestedOvertimeMinutes: 240, approvedOvertimeMinutes: 120 },
    });
    expect(result.regularPayMinor).toBe(600000);
    expect(result.overtimePremiumMinor).toBe(3750);
    expect(result.grossPayMinor).toBe(611250);
    expect(result.overtimeMinutesUnpaid).toBe(120);
  });

  it('calculates hourly pay using integer minor units', () => {
    const result = calculatePayroll({
      currency: 'CNY', ruleVersion: 'v1', policy,
      employee: { employeeId: 'E2', payType: 'hourly', baseRateMinor: 2500 },
      attendance: { regularMinutes: 480, requestedOvertimeMinutes: 60, approvedOvertimeMinutes: 60 },
    });
    expect(result.regularPayMinor).toBe(20000);
    expect(result.overtimePremiumMinor).toBe(1250);
    expect(result.grossPayMinor).toBe(23750);
  });

  it('calculates daily pay and overtime premium', () => {
    const result = calculatePayroll({
      currency: 'CNY', ruleVersion: 'v1', policy,
      employee: { employeeId: 'E3', payType: 'daily', baseRateMinor: 20000, standardDayMinutes: 480 },
      attendance: { regularMinutes: 960, payableDays: 2, requestedOvertimeMinutes: 120, approvedOvertimeMinutes: 120 },
    });
    expect(result.regularPayMinor).toBe(40000);
    expect(result.overtimePremiumMinor).toBe(2500);
    expect(result.grossPayMinor).toBe(47500);
  });

  it('rejects fractional money and overtime approval beyond requested time', () => {
    expect(() => calculatePayroll({
      currency: 'CNY', ruleVersion: 'v1', policy,
      employee: { employeeId: 'E4', payType: 'hourly', baseRateMinor: 10.5 },
      attendance: { regularMinutes: 60, approvedOvertimeMinutes: 0 },
    })).toThrow(/baseRateMinor/);
    expect(() => calculatePayroll({
      currency: 'CNY', ruleVersion: 'v1', policy,
      employee: { employeeId: 'E4', payType: 'hourly', baseRateMinor: 100 },
      attendance: { regularMinutes: 60, requestedOvertimeMinutes: 30, approvedOvertimeMinutes: 60 },
    })).toThrow(/cannot exceed/);
  });

  it('keeps explicit deductions separate from gross pay', () => {
    const result = calculatePayroll({
      currency: 'CNY', ruleVersion: 'v1', policy, deductionsMinor: 500,
      employee: { employeeId: 'E5', payType: 'hourly', baseRateMinor: 1000 },
      attendance: { regularMinutes: 60 },
    });
    expect(result.grossPayMinor).toBe(1000);
    expect(result.netPayMinor).toBe(500);
  });

  it('can include submitted overtime only when policy explicitly allows it', () => {
    const result = calculatePayroll({
      currency: 'CNY', ruleVersion: 'v1',
      policy: { overtimeMultiplierBps: 15000, requireOvertimeApproval: false },
      employee: { employeeId: 'E6', payType: 'hourly', baseRateMinor: 600 },
      attendance: { regularMinutes: 0, requestedOvertimeMinutes: 60, approvedOvertimeMinutes: 0 },
    });
    expect(result.overtimeMinutesPaid).toBe(60);
    expect(result.overtimeMinutesUnpaid).toBe(0);
    expect(result.grossPayMinor).toBe(900);
  });
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function extractFunction(name) {
  const pattern = new RegExp(
    `^        function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^        }`,
    "m"
  );
  const match = html.match(pattern);
  assert.ok(match, `Could not find ${name}() in index.html`);
  return match[0];
}

let snapshotCount = 0;
let saveCount = 0;
let renderCount = 0;
let toastMessages = [];

const sandbox = {
  document: { getElementById: () => ({ value: "" }) },
  getLocalTodayStr: () => "2026-11-19",
  getYesterdayStr: () => "2026-11-18",
  getLocalTimeStr: () => "18:00",
  saveSnapshotForUndo: () => { snapshotCount++; },
  showToast: message => { toastMessages.push(message); },
  detectDayType: () => ({ type: "workday", holidayName: "" }),
  getCycleMonthForDate: () => "2026-11",
  saveState: () => { saveCount++; },
  renderAll: () => { renderCount++; },
  currentMonth: "2026-11",
  appState: {
    config: {
      payMode: "hourly",
      hourlyRate: 35,
      monthlySalary: 7000,
      stdHours: 8,
      lunchHours: 1,
      weekdayMult: 1.5,
      weekendMult: 2,
      holidayMult: 3
    }
  }
};

vm.runInNewContext(
  `${extractFunction("getEffectiveHourlyRate")}\n${extractFunction("calcRecord")}\n${extractFunction("handleQuickPunch")}\n${extractFunction("escapeHtml")}\n${extractFunction("normalizeConfig")}\nthis.calcRecord = calcRecord; this.handleQuickPunch = handleQuickPunch; this.escapeHtml = escapeHtml; this.normalizeConfig = normalizeConfig;`,
  sandbox
);

const calc = record => sandbox.calcRecord(record);
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);

test("hourly normal shift deducts the configured break", () => {
  const result = calc({ type: "workday", startTime: "09:00", endTime: "18:00" });
  assert.equal(result.complete, true);
  near(result.netHours, 8, "net hours");
  near(result.regHours, 8, "regular hours");
  near(result.otHours, 0, "overtime hours");
  near(result.totalPay, 280, "total pay");
});

test("weekday overtime uses the configured multiplier", () => {
  const result = calc({ type: "workday", startTime: "09:00", endTime: "20:00" });
  near(result.netHours, 10, "net hours");
  near(result.regHours, 8, "regular hours");
  near(result.otHours, 2, "overtime hours");
  near(result.totalPay, 385, "total pay");
});

test("overnight shift calculates elapsed time across midnight", () => {
  const result = calc({ type: "workday", startTime: "20:00", endTime: "08:00" });
  assert.equal(result.isCrossDay, true);
  near(result.netHours, 11, "net hours");
  near(result.otHours, 3, "overtime hours");
  near(result.totalPay, 437.5, "total pay");
});

test("weekend shift pays all net hours at weekend multiplier", () => {
  const result = calc({ type: "weekend", startTime: "10:00", endTime: "18:00" });
  near(result.netHours, 7, "net hours");
  near(result.regHours, 0, "regular hours");
  near(result.otHours, 7, "overtime hours");
  near(result.totalPay, 490, "total pay");
});

test("holiday shift pays all net hours at holiday multiplier", () => {
  const result = calc({ type: "holiday", startTime: "10:00", endTime: "18:00" });
  near(result.netHours, 7, "net hours");
  near(result.otHours, 7, "overtime hours");
  near(result.totalPay, 735, "total pay");
});

test("hourly paid leave is paid at standard daily hours", () => {
  const result = calc({ type: "paid_leave" });
  assert.equal(result.complete, true);
  assert.equal(result.isLeave, true);
  near(result.regHours, 8, "paid leave hours");
  near(result.totalPay, 280, "paid leave pay");
});

test("monthly paid leave does not duplicate the fixed base salary", () => {
  sandbox.appState.config.payMode = "monthly";
  const result = calc({ type: "paid_leave" });
  near(result.regHours, 8, "paid leave hours");
  near(result.regPay, 0, "record-level paid leave pay");
  near(result.totalPay, 0, "record-level total pay");
  sandbox.appState.config.payMode = "hourly";
});

test("unpaid leave contributes no hours or pay", () => {
  const result = calc({ type: "unpaid_leave" });
  assert.equal(result.complete, true);
  assert.equal(result.isUnpaid, true);
  near(result.netHours, 0, "net hours");
  near(result.totalPay, 0, "total pay");
});

test("incomplete attendance is not counted as payable", () => {
  const result = calc({ type: "workday", startTime: "09:00", endTime: "" });
  assert.equal(result.complete, false);
  near(result.totalPay, 0, "total pay");
});

test("invalid clock values are rejected instead of producing NaN", () => {
  const result = calc({ type: "workday", startTime: "29:90", endTime: "18:00" });
  assert.equal(result.complete, false);
  assert.equal(result.invalid, true);
  near(result.totalPay, 0, "total pay");
});

test("monthly overtime uses monthly salary converted to the configured hourly rate", () => {
  sandbox.appState.config.payMode = "monthly";
  const result = calc({ type: "workday", startTime: "09:00", endTime: "20:00" });
  const hourlyRate = 7000 / (21.75 * 8);
  near(result.regPay, 0, "monthly regular record pay");
  near(result.otWeekdayPay, 2 * hourlyRate * 1.5, "monthly overtime pay");
  sandbox.appState.config.payMode = "hourly";
});


function resetPunchHarness(records) {
  snapshotCount = 0;
  saveCount = 0;
  renderCount = 0;
  toastMessages = [];
  sandbox.appState.records = records;
}

test("clocking out without an open shift does not invent a 09:00 start time", () => {
  resetPunchHarness([]);
  sandbox.handleQuickPunch("out");
  assert.equal(sandbox.appState.records.length, 0);
  assert.equal(snapshotCount, 0);
  assert.equal(saveCount, 0);
  assert.match(toastMessages[0], /未生成虚构的上班时间/);
});

test("repeated clock-in preserves the original real start time", () => {
  const record = {
    id: "existing",
    date: "2026-11-19",
    startTime: "09:07",
    endTime: "",
    type: "workday",
    note: "一键打卡"
  };
  resetPunchHarness([record]);
  sandbox.handleQuickPunch("in");
  assert.equal(record.startTime, "09:07");
  assert.equal(sandbox.appState.records.length, 1);
  assert.equal(snapshotCount, 0);
  assert.equal(saveCount, 0);
  assert.match(toastMessages[0], /原始打卡时间已保留/);
});

test("clock-in records the current actual time", () => {
  resetPunchHarness([]);
  sandbox.handleQuickPunch("in");
  assert.equal(sandbox.appState.records.length, 1);
  assert.equal(sandbox.appState.records[0].startTime, "18:00");
  assert.equal(sandbox.appState.records[0].endTime, "");
  assert.equal(saveCount, 1);
  assert.equal(renderCount, 1);
});

test("clock-out closes the active shift using the current actual time", () => {
  const record = {
    id: "active",
    date: "2026-11-19",
    startTime: "09:00",
    endTime: "",
    type: "workday",
    note: "一键打卡"
  };
  resetPunchHarness([record]);
  sandbox.handleQuickPunch("out");
  assert.equal(record.endTime, "18:00");
  assert.equal(saveCount, 1);
  assert.equal(renderCount, 1);
  assert.match(toastMessages[0], /下班打卡成功/);
});

test("untrusted imported text is escaped before HTML rendering", () => {
  const escaped = sandbox.escapeHtml('<img src=x onerror="alert(1)"> & "note"');
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;note&quot;');
});

test("manual same-day records default to append instead of overwriting existing attendance", () => {
  assert.match(html, /name="sameDayAction" value="append" checked/);
  assert.match(html, /sameDayActionEl \? sameDayActionEl\.value : 'append'/);
});

test("imported configuration accepts valid values and rejects invalid payroll rules", () => {
  const normalized = sandbox.normalizeConfig({
    payMode: "unexpected",
    hourlyRate: "not-a-number",
    monthlySalary: 9000,
    stdHours: -2,
    lunchHours: 1.25,
    weekendMult: 50,
    cycleStartDay: 31,
    strictFullAttend: "yes",
    empName: "Test employee"
  });
  assert.equal(normalized.payMode, "hourly");
  assert.equal(normalized.hourlyRate, 35);
  assert.equal(normalized.monthlySalary, 9000);
  assert.equal(normalized.stdHours, 8);
  assert.equal(normalized.lunchHours, 1.25);
  assert.equal(normalized.weekendMult, 2);
  assert.equal(normalized.cycleStartDay, 1);
  assert.equal(normalized.strictFullAttend, false);
  assert.equal(normalized.empName, "Test employee");
});

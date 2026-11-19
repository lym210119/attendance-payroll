const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:4173";
const STORAGE_KEY = "smart_attendance_payroll_v3";

async function stubExternalAssets(page) {
  await page.route("https://cdn.tailwindcss.com", route =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.tailwind = window.tailwind || { config: {} };"
    })
  );
  await page.route("https://cdn.sheetjs.com/**", route =>
    route.fulfill({ contentType: "application/javascript", body: "window.XLSX = {};" })
  );
  await page.route("https://unpkg.com/lucide@latest", route =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.lucide = { createIcons: function () {} };"
    })
  );
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubExternalAssets(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const clock = document.getElementById("liveClockDisplay");
      return clock && clock.textContent.trim() !== "00:00:00";
    });

    assert.match(await page.title(), /牛马打卡/);
    assert.ok(await page.locator("#globalMonthInput").inputValue());

    const clockIn = page.locator("button").filter({ hasText: "上班打卡" }).first();
    const clockOut = page.locator("button").filter({ hasText: "下班打卡" }).first();

    await clockIn.click();
    let state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(state.records.length, 1);
    const originalStart = state.records[0].startTime;
    assert.match(originalStart, /^([01]\\d|2[0-3]):[0-5]\\d$/);

    await clockIn.click();
    state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(state.records.length, 1);
    assert.equal(state.records[0].startTime, originalStart);

    await clockOut.click();
    state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.ok(state.records[0].endTime);
    assert.match(state.records[0].endTime, /^([01]\\d|2[0-3]):[0-5]\\d$/);

    await page.reload({ waitUntil: "domcontentloaded" });
    state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(state.records[0].startTime, originalStart);
    assert.ok(state.records[0].endTime);

    await page.evaluate(() => {
      appState.records.push({
        id: "xss-check",
        date: getLocalTodayStr(),
        startTime: "09:00",
        endTime: "18:00",
        type: "workday",
        note: '<img src=x onerror="window.__attendanceXss=1">'
      });
      renderAll();
    });
    assert.equal(await page.locator("#recordsListWrapper img").count(), 0);
    assert.equal(await page.evaluate(() => window.__attendanceXss || 0), 0);

    const protectedContext = await browser.newContext();
    const protectedPage = await protectedContext.newPage();
    await stubExternalAssets(protectedPage);
    await protectedPage.addInitScript(key => {
      localStorage.setItem(key, "{broken-json");
    }, STORAGE_KEY);
    await protectedPage.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await protectedPage.waitForFunction(() => document.getElementById("liveClockDisplay")?.textContent.trim() !== "00:00:00");
    const before = await protectedPage.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    await protectedPage.locator("button").filter({ hasText: "上班打卡" }).first().click();
    const after = await protectedPage.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    assert.equal(after, before, "corrupt local storage must never be overwritten by a punch");

    await protectedContext.close();
    await context.close();
    process.stdout.write("Browser smoke tests passed: startup, real punches, duplicate protection, persistence, XSS escaping, and corrupt-storage protection.\\n");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

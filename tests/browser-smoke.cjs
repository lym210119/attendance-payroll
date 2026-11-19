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
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await stubExternalAssets(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => document.getElementById("globalMonthInput")?.value, { timeout: 8000 });
    } catch (error) {
      throw new Error(`App initialization did not complete. Browser errors: ${pageErrors.join(" | ")}`);
    }

    assert.match(await page.title(), /牛马打卡/);
    assert.ok(await page.locator("#globalMonthInput").inputValue());

    // Responsive sanity checks for narrow mobile widths. Tailwind is stubbed in this
    // smoke test, so assert our custom mobile header layout and viewport behavior.
    for (const width of [320, 360, 375, 390, 414]) {
      await page.setViewportSize({ width, height: 844 });
      const responsive = await page.evaluate(() => {
        const headerInner = document.querySelector("header .max-w-7xl");
        const meta = document.querySelector('meta[name="viewport"]')?.content || "";
        return {
          headerDisplay: getComputedStyle(headerInner).display,
          headerGridColumns: getComputedStyle(headerInner).gridTemplateColumns,
          headerScrollWidth: headerInner.scrollWidth,
          headerClientWidth: headerInner.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          viewportAllowsZoom: !/user-scalable\\s*=\\s*no|max-scale\\s*=\\s*1(?:\\.0)?/i.test(meta),
          modalMobileRules: [...document.styleSheets].some(sheet => {
            try { return [...sheet.cssRules].some(rule => rule.cssText.includes("100dvh")); }
            catch { return false; }
          })
        };
      });
      assert.equal(responsive.headerDisplay, "grid", `mobile header grid at ${width}px`);
      assert.ok(responsive.headerScrollWidth <= responsive.headerClientWidth + 2, `header overflow at ${width}px: ${JSON.stringify(responsive)}`);
      assert.ok(responsive.pageWidth <= width + 2, `page horizontal overflow at ${width}px: ${JSON.stringify(responsive)}`);
      assert.ok(responsive.viewportAllowsZoom, "viewport must allow accessibility zoom");
      assert.ok(responsive.modalMobileRules, "mobile modal viewport-height rules must be present");
    }
    await page.setViewportSize({ width: 375, height: 812 });
    for (const tab of ["records", "payroll", "rules", "punch"]) {
      await page.evaluate(tabName => switchMobileTab(tabName), tab);
      assert.ok(await page.locator(`#sec-${tab}`).evaluate(el => !el.classList.contains("hidden")), `mobile tab ${tab} should be active`);
    }

    const clockIn = page.locator("button").filter({ hasText: "上班打卡" }).first();
    const clockOut = page.locator("button").filter({ hasText: "下班打卡" }).first();

    await clockIn.click();
    let state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(state.records.length, 1);
    const originalStart = state.records[0].startTime;
    assert.match(originalStart, /^([01]\d|2[0-3]):[0-5]\d$/);

    await clockIn.click();
    state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(state.records.length, 1);
    assert.equal(state.records[0].startTime, originalStart);

    await clockOut.click();
    state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.ok(state.records[0].endTime);
    assert.match(state.records[0].endTime, /^([01]\d|2[0-3]):[0-5]\d$/);

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
    assert.ok(await page.locator("#recordsListWrapper").getByText("班次边界").count(), "record list should show boundary diagnostics");
    assert.equal(await page.locator("#recordsListWrapper img").count(), 0);
    assert.equal(await page.evaluate(() => window.__attendanceXss || 0), 0);

    const protectedContext = await browser.newContext();
    const protectedPage = await protectedContext.newPage();
    await stubExternalAssets(protectedPage);
    await protectedPage.addInitScript(key => {
      localStorage.setItem(key, "{broken-json");
    }, STORAGE_KEY);
    await protectedPage.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await protectedPage.waitForFunction(() => document.getElementById("globalMonthInput")?.value, { timeout: 8000 });
    const before = await protectedPage.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    await protectedPage.locator("button").filter({ hasText: "上班打卡" }).first().click();
    const after = await protectedPage.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    assert.equal(after, before, "corrupt local storage must never be overwritten by a punch");

    await protectedContext.close();
    await context.close();
    process.stdout.write("Browser smoke tests passed: startup, real punches, duplicate protection, persistence, XSS escaping, and corrupt-storage protection.\n");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

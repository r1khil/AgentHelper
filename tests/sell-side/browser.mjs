import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const destination = ctx.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    return destination.stream;
  };
});
const origin = "http://127.0.0.1:4321";
const counters = async () => (await page.request.get(`${origin}/test/controls`)).json();
try {
  await page.goto(origin);
  await page.getByLabel("Company", { exact: true }).selectOption("other");
  await page.getByLabel("Company name", { exact: true }).fill("Snowflake");
  await page.getByLabel("Ticker", { exact: true }).fill("snow");
  await page.getByLabel("Call title", { exact: true }).fill("Broker outlook");
  // The Record a call card comes first on the page; the call's own recorder has a button with the same name.
  await page.getByRole("button", { name: "Start recording", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "SNOW · Snowflake · Broker outlook" })).toBeVisible();
  const callUrl = page.url();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recording live" })).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recording paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop & analyze", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("saved transcript is safe", { timeout: 20000 });
  await expect(page.getByRole("region", { name: "Call transcript" })).toContainText("29% year over year");
  await expect(page.getByRole("button", { name: "Retry analysis", exact: true })).toBeEnabled();
  const failed = await counters();
  expect(failed.transcriptions).toBe(1);
  expect(failed.notes).toBe(2);
  await page.screenshot({
    path: ".artifacts/sell-side-test/analysis-retry.png",
    fullPage: true,
  });
  // Simulate a separate final-synthesis failure. The second retry must skip both upload and part notes.
  await page.request.post(`${origin}/test/controls`, {
    data: { failAnalysis: 2 },
  });
  await page.getByRole("button", { name: "Retry analysis", exact: true }).click();
  await expect.poll(async () => (await counters()).analyses).toBe(2);
  await expect(page.getByRole("alert")).toContainText("saved transcript is safe", { timeout: 15000 });
  const beforeRetry = await counters();
  await page.getByRole("button", { name: "Retry analysis", exact: true }).click();
  await expect(page.getByRole("region", { name: "Call analysis" })).toBeVisible({ timeout: 20000 });
  const afterRetry = await counters();
  expect(afterRetry.transcriptions).toBe(beforeRetry.transcriptions);
  expect(afterRetry.notes).toBe(beforeRetry.notes);
  expect(afterRetry.uploads).toBe(beforeRetry.uploads);
  for (const name of ["What was said", "Important numbers, checked against the team's files", "Positive commentary", "Risks & watch points", "Themes"])
    await expect(page.getByRole("heading", { name, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Call analysis" })).toContainText("$3.2 billion");
  await expect(page.getByRole("region", { name: "Call analysis" })).toContainText("periods differ");
  await page
    .getByRole("region", { name: "Call analysis" })
    .getByRole("button", { name: /Snowflake.*Part 1/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("29% year over year");
  await page.keyboard.press("Escape");
  await page
    .getByRole("region", { name: "Call analysis" })
    .getByRole("button", { name: /Internal company model/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("FY26 revenue: $2.8 billion.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open call chat" }).click();
  const chat = page.getByRole("region", { name: "Discuss this call" });
  await chat.getByRole("textbox").fill("What was the margin risk?");
  await chat.getByRole("textbox").press("Enter");
  await expect(chat).toContainText("Margins remain uncertain because of data center spending.", { timeout: 15000 });
  await chat
    .getByRole("button", { name: /Snowflake.*Part 1/ })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("29% year over year");
  await page.keyboard.press("Escape");
  await expect(chat.getByRole("button", { name: /Source unavailable/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Call analysis" })).toBeVisible();
  await page.getByRole("button", { name: "Open call chat" }).click();
  await expect(page.getByRole("region", { name: "Discuss this call" })).toContainText("Margins remain uncertain because of data center spending.");
  await page.getByRole("link", { name: "← Saved calls" }).click();
  await page.getByRole("link", { name: "SNOW · Snowflake · Broker outlook" }).click();
  await expect(page.getByRole("region", { name: "Call analysis" })).toBeVisible();
  expect(page.url()).toBe(callUrl);
  const retrieved = await (await page.request.get(`${origin}/test/search?ticker=SNOW`)).json();
  expect(retrieved.data.passages.length).toBe(1);
  expect(retrieved.sources[0].documentId).toContain("call-");
  const denied = await (await page.request.get(`${origin}/test/search?ticker=SNOW&team=99999999-9999-4999-8999-999999999999`)).json();
  expect(denied.data.passages).toHaveLength(0);
  // The transcript is a tab of the call pane.
  await page.getByRole("tab", { name: "Transcript" }).click();
  await page.getByLabel("Search transcript").fill("not in this transcript");
  await expect(page.getByRole("region", { name: "Call transcript" }).getByText("We expect FY27", { exact: false })).toHaveCount(0);
  await page.getByLabel("Search transcript").fill("");
  await page.screenshot({
    path: ".artifacts/sell-side-test/analysis-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".artifacts/sell-side-test/analysis-mobile.png",
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Exercise the existing holding path and a two-minute rollover with the real MediaRecorder.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin);
  await page.getByLabel("Call title", { exact: true }).fill("Long AMZN call");
  // The Record a call card comes first on the page; the call's own recorder has a button with the same name.
  await page.getByRole("button", { name: "Start recording", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "AMZN · Long AMZN call" })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.clock.fastForward(121000);
  await expect.poll(async () => (await counters()).uploads).toBe(2);
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop & analyze", exact: true }).click();
  await expect(page.getByRole("region", { name: "Call analysis" })).toBeVisible({ timeout: 20000 });
  const longId = page.url().split("/").at(-1);
  const long = await (await page.request.get(`${origin}/api/sell-side/${longId}`)).json();
  expect(long.call.holdingId).toBe("22222222-2222-4222-8222-222222222222");
  expect(long.parts).toHaveLength(2);
  expect(Number(long.parts[1].offset)).toBeGreaterThanOrEqual(120);
  expect(long.parts[1].segments[0].start).toBeGreaterThanOrEqual(120);
  expect((await counters()).transcriptions).toBe(3);
  expect(errors).toEqual([]);
  console.log(
    "PASS: non-portfolio creation, real mic recorder/pause/resume, upload, transcription, reasoning-only failures, targeted retries, structured brief, transcript/internal citations, streamed follow-up chat, saved-call reopening, later retrieval and team isolation, mobile layout.",
  );
} catch (error) {
  await page.screenshot({
    path: ".artifacts/sell-side-test/failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}

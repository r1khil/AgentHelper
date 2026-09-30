import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
async function drag(section, from = 0.01, to = 0.99, outside = false) {
  const slider = section.getByRole("slider");
  await slider.scrollIntoViewIfNeeded();
  const b = await slider.boundingBox();
  if (!b) throw new Error("No plot bounds");
  await page.mouse.move(b.x + b.width * from, b.y + b.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(
    b.x + b.width * to,
    b.y + (outside ? b.height + 30 : b.height * 0.7),
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(
    section.getByRole("button", { name: "Clear selection" }),
  ).toBeVisible();
  return section.getByRole("status");
}
try {
  await page.goto("http://127.0.0.1:4322", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Synthetic chart interaction checks" }),
  ).toBeVisible();
  for (const id of [
    "overview",
    "holding",
    "price",
    "intraday",
    "cumulative",
    "comparison",
    "drawdown",
    "stress",
    "performance",
    "zero",
  ]) {
    const section = page.locator(`#${id}`);
    if (
      [
        "price",
        "intraday",
        "cumulative",
        "comparison",
        "drawdown",
        "stress",
        "performance",
      ].includes(id)
    ) {
      await section.getByRole("slider").scrollIntoViewIfNeeded();
      const onTop = await section
        .locator(".recharts-line-curve, .recharts-area-curve")
        .first()
        .evaluate((path) => {
          const p = path.getPointAtLength(path.getTotalLength() / 2);
          const point = new DOMPoint(p.x, p.y).matrixTransform(
            path.getScreenCTM(),
          );
          return (
            document
              .elementFromPoint(point.x, point.y)
              ?.getAttribute("role") === "slider"
          );
        });
      expect(
        onTop,
        `${id}: clicking directly on a line reaches the drag surface`,
      ).toBe(true);
    }
    await drag(section);
    const forward = await section.getByRole("status").innerText();
    await section.getByRole("button", { name: "Clear selection" }).click();
    await drag(section, 0.99, 0.01);
    expect(await section.getByRole("status").innerText()).toBe(forward);
    await section.getByRole("slider").press("Escape");
    await expect(
      section.getByRole("button", { name: "Clear selection" }),
    ).toHaveCount(0);
    console.log(`PASS ${id}: forward/reverse drag, retained endpoints, Escape`);
  }
  const overview = page.locator("#overview");
  await drag(overview, 0.01, 1.5, true);
  await expect(overview.getByRole("status")).toContainText("$100.00 → $120.00");
  await expect(overview.getByRole("status")).toContainText(
    "today's weights replayed → Ledger history",
  );
  await overview.screenshot({
    path: ".artifacts/charts-test/overview-selection.png",
  });
  await overview.getByRole("button", { name: "1W", exact: true }).click();
  await expect(
    overview.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  await overview.getByRole("button", { name: "1D", exact: true }).click();
  await expect(overview.getByRole("slider")).toBeVisible();
  await drag(overview);
  await expect(overview.getByRole("status")).toContainText("five-minute steps");
  console.log(
    "PASS overview: outside capture, replay disclosure, range and daily API response",
  );

  const holding = page.locator("#holding");
  await holding.getByRole("slider").press("Home");
  await holding.getByRole("slider").press("ArrowRight");
  await holding.getByRole("slider").press("ArrowRight");
  await expect(holding.getByRole("status")).toContainText("Bought 2");
  await holding.getByRole("slider").press("Shift+End");
  await expect(
    holding.getByRole("button", { name: "Clear selection" }),
  ).toBeVisible();
  await holding.getByRole("button", { name: "1D", exact: true }).click();
  await expect(
    holding.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  await expect(holding.getByRole("slider")).toBeVisible();
  await drag(holding);
  console.log(
    "PASS holding: keyboard endpoints, trade disclosure, daily range reset",
  );

  const comparison = page.locator("#comparison");
  await drag(comparison, 0.25, 0.5);
  await expect(comparison.getByRole("status")).toContainText(
    "Interval return +10.00%",
  );
  await expect(comparison.getByRole("status")).toContainText("Unavailable");
  await expect(comparison.getByRole("status")).not.toContainText(
    "Interval return gap",
  );
  await comparison.getByRole("button", { name: "Replace data" }).click();
  await expect(
    comparison.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  await comparison.getByRole("button", { name: "Replace data" }).click();
  await expect(
    comparison.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  await comparison.getByRole("button", { name: "Replace data" }).click();
  await expect(comparison.getByRole("slider")).toHaveAttribute(
    "aria-valuemax",
    "1",
  );
  await comparison.getByRole("slider").press("Home");
  await comparison.getByRole("slider").press("Shift+End");
  await expect(
    comparison.getByRole("button", { name: "Clear selection" }),
  ).toBeVisible();
  console.log(
    "PASS comparison: compounding, missing benchmark, data replacement, keyboard selection",
  );

  const drawdown = page.locator("#drawdown");
  await drag(drawdown, 0.25, 0.5);
  await expect(drawdown.getByRole("status")).toContainText(
    "Change in drawdown 5.00 percentage points",
  );
  await expect(drawdown.getByRole("status")).not.toContainText(
    "Interval return",
  );
  await drawdown.screenshot({
    path: ".artifacts/charts-test/drawdown-selection.png",
  });

  const zero = page.locator("#zero");
  await drag(zero);
  await expect(zero.getByRole("status")).toContainText("Return unavailable");
  const slider = zero.getByRole("slider");
  await slider.press("Escape");
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + 40);
  await slider.dispatchEvent("pointercancel", {
    pointerId: 1,
    isPrimary: true,
  });
  await page.mouse.up();
  await expect(
    zero.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  console.log("PASS drawdown units, zero baseline, pointer cancellation");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.locator("html").evaluate((e) => e.classList.add("dark"));
  await drag(overview);
  await overview.screenshot({
    path: ".artifacts/charts-test/mobile-selection.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await overview.getByRole("slider").press("Escape");
  await overview.getByRole("slider").scrollIntoViewIfNeeded();
  const touchBox = await overview.getByRole("slider").boundingBox();
  const touch = async (type, fraction) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd"
          ? []
          : [
              {
                x: touchBox.x + touchBox.width * fraction,
                y: touchBox.y + touchBox.height * 0.65,
              },
            ],
    });
  await touch("touchStart", 0.05);
  await touch("touchMove", 0.4);
  await touch("touchMove", 0.95);
  await touch("touchEnd");

  await expect(
    overview.getByRole("button", { name: "Clear selection" }),
  ).toBeVisible();
  await overview.getByRole("button", { name: "Clear selection" }).click();
  const beforeScroll = await page.evaluate(() => scrollY);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: touchBox.x + touchBox.width / 2,
        y: touchBox.y + touchBox.height * 0.8,
      },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchBox.x + touchBox.width / 2, y: touchBox.y + 10 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(beforeScroll);
  await expect(
    overview.getByRole("button", { name: "Clear selection" }),
  ).toHaveCount(0);
  console.log(
    "PASS mobile layout, dark/reduced-motion, touch drag and vertical scrolling",
  );
  expect(errors).toEqual([]);
  console.log("PASS no browser errors");
} finally {
  await browser.close();
}

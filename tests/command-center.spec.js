import { expect, test } from "@playwright/test";

async function loginAsDelivery(page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Delivery login/i }).click();
  await page.getByLabel("Username").fill("delivery");
  await page.getByLabel("Password").fill("delivery@truefan");
  await page.getByRole("button", { name: /Login to Delivery/i }).click();
  await expect(page.getByRole("button", { name: /Daily Scrum/i })).toBeVisible();
}

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: Array.from(document.body.querySelectorAll("*"))
      .filter((node) => node.scrollWidth > node.clientWidth + 4 && !["TABLE", "TBODY", "THEAD", "TR"].includes(node.tagName))
      .slice(0, 8)
      .map((node) => ({
        tag: node.tagName,
        className: node.className,
        text: node.textContent?.trim().slice(0, 80),
        width: node.clientWidth,
        scrollWidth: node.scrollWidth
      }))
  }));

  expect(overflow.scrollWidth, JSON.stringify(overflow.offenders, null, 2)).toBeLessThanOrEqual(overflow.width + 4);
}

test("delivery can use the scrum flow and dashboard pages do not overflow", async ({ page }) => {
  await loginAsDelivery(page);

  for (const name of ["Overview", "Delivery Task Board", "Daily Scrum", "Team Bandwidth"]) {
    await page.getByRole("button", { name: new RegExp(name, "i") }).click();
    await expect(page.locator(".content-area")).toBeVisible();
    await expectNoPageOverflow(page);
  }

  await page.getByRole("button", { name: /Daily Scrum/i }).click();
  await expect(page.getByText("DM pick for today")).toBeVisible();
  await expect(page.getByRole("button", { name: /Export Excel/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Send to lead/i })).toBeVisible();
});

test("delivery task cards lead with the company name instead of generic tracker text", async ({ page }) => {
  await loginAsDelivery(page);
  await page.getByRole("button", { name: /Delivery Task Board/i }).click();

  const firstTitle = page.locator(".task-card .company-title").first();
  await expect(firstTitle).toBeVisible();
  await expect(firstTitle).not.toHaveText(/Delivery tracker update/i);
});

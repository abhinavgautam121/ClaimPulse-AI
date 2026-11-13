import { test, expect } from "@playwright/test";
const uid = () => Date.now().toString(36).toUpperCase();
async function demo(page: any) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Enter synthetic demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Revenue, in focus." }),
  ).toBeVisible({ timeout: 30000 });
}

test("all workspace routes load and contain calculated content", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await expect(page.getByText("Live updates", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const routes = [
    ["claims", "Claims management"],
    ["denials", "Understand the denial."],
    ["revenue-risk", "Put revenue risk in perspective."],
    ["claim-prioritisation", "The right claim. The next action."],
    ["payer-performance", "A clearer payer perspective."],
    ["underpayments", "Spot the reimbursement gap."],
    ["predictive-analytics", "Review risk before the outcome."],
    ["copilot", "ClaimPulse Copilot"],
    ["live-monitor", "Your claims, as they move."],
    ["data-ingestion", "Good intelligence starts with good data."],
    ["data-quality", "Trust the data behind the decision."],
    ["reports", "From insight to a shared view."],
    ["settings", "Make the workspace work for you."],
  ];
  for (const [route, title] of routes) {
    await page.goto("/" + route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("We couldn’t load this view.")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("claim creation, filtering, note, assignment and status lifecycle", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/claims");
  await page.getByRole("button", { name: "Create claim", exact: true }).click();
  const id = "BROWSER-" + uid();
  await page.getByLabel("Claim ID", { exact: true }).fill(id);
  await page.getByLabel("Billed amount ($)", { exact: true }).fill("2500");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create claim", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search claims", { exact: true }).fill(id);
  await expect(page.getByRole("link", { name: id, exact: true })).toBeVisible();
  await page.getByRole("link", { name: id, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: id, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Team note", { exact: true })
    .fill("Synthetic documentation reviewed in browser test.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page.getByText("Synthetic documentation reviewed in browser test."),
  ).toBeVisible();
  await page.getByLabel("Assigned to", { exact: true }).selectOption("2");
  await page.getByLabel("Priority", { exact: true }).selectOption("High");
  await page
    .getByLabel("Follow-up action", { exact: true })
    .fill("Follow up with synthetic payer.");
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await expect(
    page.getByText("Follow up with synthetic payer.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Next status", { exact: true })
    .selectOption("Processing");
  await page
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(page.locator(".detail-status-row .status")).toContainText(
    "Processing",
  );
  await page.getByLabel("Next status", { exact: true }).selectOption("Paid");
  await page
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(page.locator(".detail-status-row .status")).toContainText(
    "Paid",
  );
  await expect(
    page.getByRole("heading", { name: "Payment ledger", exact: true }),
  ).toBeVisible();
});

test("CSV validates rows and exposes downloadable errors", async ({ page }) => {
  await demo(page);
  await page.goto("/data-ingestion");
  const id = "CSV-BROWSER-" + uid();
  const today = new Date().toISOString().slice(0, 10);
  const csv = `id,patient_id,provider_id,payer_id,submission_date,service_date,amount,status\n${id},SYN-BROWSER,1,1,${today},${today},500,Submitted\n${id},SYN-BROWSER,1,1,${today},${today},500,Submitted\nBAD-${id},SYN-BROWSER,1,1,${today},${today},-1,Submitted\n`;
  await page
    .getByLabel("Upload claims CSV")
    .setInputFiles({
      name: "browser-test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(
    page.getByText("1 valid · 1 rejected · 1 duplicates"),
  ).toBeVisible({ timeout: 30000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Error report", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("ingestion-errors.csv");
  await page.goto("/data-quality");
  await expect(page.getByText(/browser-test.csv/).first()).toBeVisible();
});

test("Copilot answers from data and exposes evidence", async ({ page }) => {
  await demo(page);
  await page.goto("/copilot");
  await page
    .getByRole("button", { name: "What is the total revenue at risk?" })
    .click();
  await expect(page.locator(".assistant-message").first()).toContainText(
    "flagged for review",
    { timeout: 30000 },
  );
  await expect(page.getByText("Supporting data · 2 rows")).toBeVisible();
  await expect(page.locator(".answer-source")).toContainText("PostgreSQL");
  await page.getByLabel("Ask ClaimPulse Copilot").fill("DROP TABLE claims");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".assistant-message").last()).toContainText(
    "cannot execute arbitrary SQL",
    { timeout: 30000 },
  );
});

test("simulator persists events and can pause and stop", async ({ page }) => {
  await demo(page);
  await page.goto("/live-monitor");
  await page.getByLabel("Event frequency").selectOption("1");
  await page.getByLabel("Number of generated claims").fill("2");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByText("Simulation running", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".activity-feed")).toContainText("SIM-", {
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByText("Simulation paused", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByText("Simulation stopped", { exact: true }),
  ).toBeVisible();
});

test("report export and date changes perform real requests", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Last 90 days", exact: true }).click();
  await page.getByRole("button", { name: "Last 30 days", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Last 30 days", exact: true }),
  ).toBeVisible();
  await page.goto("/reports");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download CSV", exact: true })
      .first()
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe("claimpulse-claims.csv");
});

test("mobile navigation and dashboard fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Claims", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "Claims management" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("registration and login preserve analyst role restrictions", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill("Browser Analyst");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`browser-${uid().toLowerCase()}@example.org`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-only-Password!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revenue, in focus." }),
  ).toBeVisible();
  await page.goto("/predictive-analytics");
  await expect(
    page.getByRole("button", { name: /Retrain models|Train models/ }),
  ).toBeDisabled();
  await expect(
    page.getByText("Admin access required", { exact: true }),
  ).toBeVisible();
});

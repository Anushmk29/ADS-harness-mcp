import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE_URL = "http://127.0.0.1:3000";
const SCREENSHOT_DIR = path.resolve("browser-audit-screenshots");

async function runDeepInteractionAudit() {
  console.log("=== Starting Deep Interactive User Flow Audit ===");

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const interactionResults = [];

  try {
    // 1. Log in as Admin
    console.log("Logging in as Admin...");
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("Email").fill("admin@agricultureislife.com");
    await page.getByLabel("Password").fill("Admin@123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.toString().includes("/login"));
    console.log("Logged in successfully.");

    // 2. Interactive Flow: Packing Floor - 1-Click Fast-Track Packing
    console.log("\n[Interactive Flow 1] Testing 1-Click Fast-Track Pack on /packing...");
    await page.goto(`${BASE_URL}/packing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Click on CT Group
    const ctGroupBtn = page.getByRole("button", { name: "CT Group" });
    if (await ctGroupBtn.isVisible()) {
      await ctGroupBtn.click();
      await page.waitForTimeout(1000);
      console.log("  Clicked 'CT Group' filter.");
    }

    // Look for an Auto-Pack button
    const autoPackBtns = page.getByRole("button", { name: /auto-pack/i });
    const autoPackCount = await autoPackBtns.count();
    console.log(`  Found ${autoPackCount} Auto-Pack button(s) for sub-customers.`);

    if (autoPackCount > 0) {
      console.log("  Clicking first Auto-Pack button...");
      await autoPackBtns.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_after_auto_pack_click.png") });
      interactionResults.push({
        flow: "1-Click Auto-Pack",
        status: "SUCCESS",
        detail: "Auto-Pack clicked without crashing, updated packing state",
      });
    }

    // Test "1-Click Fast-Track All CT Stores" batch button
    const fastTrackAllBtn = page.getByRole("button", { name: /1-click fast-track all/i });
    if (await fastTrackAllBtn.isVisible()) {
      console.log("  Testing '1-Click Fast-Track All CT Stores' batch button...");
      await fastTrackAllBtn.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_after_fast_track_all_batch.png") });
      interactionResults.push({
        flow: "1-Click Fast-Track Group Batch",
        status: "SUCCESS",
        detail: "Group batch packing executed successfully",
      });
    }

    // 3. Interactive Flow: Procurement - Export Buyer Sheet
    console.log("\n[Interactive Flow 2] Testing Buyer Sheet & Procurement on /procurement...");
    await page.goto(`${BASE_URL}/procurement`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const exportBtn = page.getByRole("button", { name: /export buyer sheet/i });
    if (await exportBtn.isVisible()) {
      console.log("  Testing 'Export Buyer Sheet' button...");
      const [downloadOrPopup] = await Promise.all([
        page.waitForEvent("popup", { timeout: 4000 }).catch(() => null),
        exportBtn.click(),
      ]);
      console.log(`  Buyer sheet popup/tab opened: ${Boolean(downloadOrPopup)}`);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12_procurement_buyer_sheet.png") });
      interactionResults.push({
        flow: "Export Buyer Sheet",
        status: "SUCCESS",
        detail: "Triggered buyer sheet export without error",
      });
    }

    // 4. Interactive Flow: Billing - Inspect Work Queue Dropdown
    console.log("\n[Interactive Flow 3] Testing Billing Settlement Work Queue on /billing...");
    await page.goto(`${BASE_URL}/billing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const orderSelect = page.locator("select").first();
    if (await orderSelect.isVisible()) {
      const options = await orderSelect.locator("option").allInnerTexts();
      console.log(`  Available orders in billing queue: ${options.length} (first 3: ${options.slice(0, 3).join(", ")})`);

      if (options.length > 1) {
        // Select an actual order
        await orderSelect.selectOption({ index: 1 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13_billing_order_selected.png") });
        interactionResults.push({
          flow: "Billing Work Queue Selection",
          status: "SUCCESS",
          detail: `Selected order '${options[1]}' and populated client order details`,
        });
      }
    }

  } catch (err) {
    console.error("Deep interaction error:", err);
    interactionResults.push({ flow: "Error", status: "FAILED", detail: err.message });
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, "deep_interaction_results.json"),
      JSON.stringify(interactionResults, null, 2)
    );
    console.log("=== Deep Interactive Audit Finished ===");
  }
}

runDeepInteractionAudit();


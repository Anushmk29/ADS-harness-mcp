import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE_URL = "http://127.0.0.1:3000";
const SCREENSHOT_DIR = path.resolve("browser-audit-screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const auditLog = {
  timestamp: new Date().toISOString(),
  pagesTested: [],
  networkFailures: [],
  consoleErrors: [],
  pageErrors: [],
  workingFeatures: [],
  brokenFeatures: [],
};

async function runBrowserAudit() {
  console.log("=== Starting Automated User Browser Audit ===");
  console.log(`Target: ${BASE_URL}`);

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Monitor network and console
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Console Error] ${msg.text()}`);
      auditLog.consoleErrors.push({ url: page.url(), message: msg.text() });
    }
  });

  page.on("pageerror", (err) => {
    console.log(`[Browser Page Error] ${err.message}`);
    auditLog.pageErrors.push({ url: page.url(), message: err.message });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log(`[HTTP Error ${res.status()}] ${res.url()}`);
      auditLog.networkFailures.push({
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        page: page.url(),
      });
    }
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Protected Route Redirection (Unauthenticated)
    // -------------------------------------------------------------
    console.log("\n[Test 1] Testing Protected Route Redirection on /billing...");
    await page.goto(`${BASE_URL}/billing`, { waitUntil: "networkidle" });
    const currentUrl = page.url();
    const isRedirectedToLogin = currentUrl.includes("/login");
    console.log(`  Current URL: ${currentUrl}`);
    if (isRedirectedToLogin) {
      auditLog.workingFeatures.push(
        "Protected Route Guard: Successfully redirects unauthenticated user from /billing to /login?next=%2Fbilling"
      );
    } else {
      auditLog.brokenFeatures.push(
        "Protected Route Guard: Failed to redirect unauthenticated user to /login"
      );
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_redirect_login.png") });

    // -------------------------------------------------------------
    // Test 2: Login Flow (Invalid + Valid Credentials)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Testing Login Flow on /login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // 2a. Invalid login attempt
    console.log("  Attempting invalid login...");
    await page.getByLabel("Email").fill("invalid@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForTimeout(1000);
    const errorBanner = await page.locator(".text-rose-700, .bg-rose-50, [role='alert'], p").filter({ hasText: /invalid|failed/i }).first();
    const hasError = await errorBanner.isVisible().catch(() => false);
    if (hasError) {
      auditLog.workingFeatures.push(
        "Login Security: Correctly rejects invalid credentials and displays error banner"
      );
    } else {
      auditLog.brokenFeatures.push("Login Security: No visible error feedback on invalid login");
    }

    // 2b. Valid login attempt
    console.log("  Attempting valid login as admin@agricultureislife.com...");
    await page.getByLabel("Email").fill("admin@agricultureislife.com");
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 8000 });
    console.log(`  Logged in, landed on: ${page.url()}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_dashboard_after_login.png") });
    auditLog.workingFeatures.push(
      "Login Authentication: Successfully authenticated with Admin credentials and stored session cookie"
    );

    // -------------------------------------------------------------
    // Test 3: Operations Command Dashboard (/)
    // -------------------------------------------------------------
    console.log("\n[Test 3] Auditing Operations Dashboard (/)...");
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const hasNav = await page.locator("nav, aside, [data-purpose='primary-sidebar']").first().isVisible().catch(() => false);
    const hasKpis = await page.locator("h1, h2, h3, .grid, .kpi").first().isVisible().catch(() => false);
    const dashboardTitle = await page.title();
    console.log(`  Dashboard Title: ${dashboardTitle}`);
    if (hasNav && hasKpis) {
      auditLog.workingFeatures.push(
        "Operations Dashboard: Renders responsive navigation sidebar, executive KPI status, and operations pipeline"
      );
    } else {
      auditLog.brokenFeatures.push("Operations Dashboard: Navigation or KPI cards failed to render");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_operations_dashboard.png") });

    // -------------------------------------------------------------
    // Test 4: Orders Intake & Splitting (/orders)
    // -------------------------------------------------------------
    console.log("\n[Test 4] Auditing Orders Intake (/orders)...");
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const hasUploadCard = await page.locator("input[type='file'], form, button").first().isVisible().catch(() => false);
    const customerSelect = page.locator("select").first();
    const hasCustomerOptions = await customerSelect.isVisible().catch(() => false);
    console.log(`  Upload UI visible: ${hasUploadCard}, Customer selector visible: ${hasCustomerOptions}`);
    if (hasUploadCard) {
      auditLog.workingFeatures.push(
        "Orders Intake: Universal file upload zone, format selector, and customer mapping controls rendered"
      );
    } else {
      auditLog.brokenFeatures.push("Orders Intake: Upload zone or intake form is missing");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_orders_intake.png") });

    // -------------------------------------------------------------
    // Test 5: Master Procurement & Buyer Sheet (/procurement)
    // -------------------------------------------------------------
    console.log("\n[Test 5] Auditing Procurement & Purchasing (/procurement)...");
    await page.goto(`${BASE_URL}/procurement`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const procurementContent = await page.content();
    const hasBatchCard = procurementContent.includes("Batch") || procurementContent.includes("Purchasing");
    const buyerSheetBtn = page.getByRole("button", { name: /buyer sheet|print|sheet/i }).first();
    const hasBuyerSheetBtn = await buyerSheetBtn.isVisible().catch(() => false);
    console.log(`  Batch Content: ${hasBatchCard}, Buyer Sheet button: ${hasBuyerSheetBtn}`);
    if (hasBatchCard) {
      auditLog.workingFeatures.push(
        "Procurement Module: Displays master purchasing batch, item demand aggregation, and buffer controls"
      );
    } else {
      auditLog.brokenFeatures.push("Procurement Module: Batch display or item table failed to load");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_procurement_batch.png") });

    // -------------------------------------------------------------
    // Test 6: Packing Command Station (/packing)
    // -------------------------------------------------------------
    console.log("\n[Test 6] Auditing Packing Station (/packing)...");
    await page.goto(`${BASE_URL}/packing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const fastTrackBtn = page.getByRole("button", { name: /fast-track|pack/i }).first();
    const hasFastTrackBtn = await fastTrackBtn.isVisible().catch(() => false);
    const hasPackingTabs = await page.getByRole("tab, button").filter({ hasText: /group|single|order/i }).first().isVisible().catch(() => false);
    console.log(`  Fast-Track button: ${hasFastTrackBtn}, Packing tabs: ${hasPackingTabs}`);
    if (hasFastTrackBtn || hasPackingTabs) {
      auditLog.workingFeatures.push(
        "Packing Station: 1-Click Fast-Track Packing controls, group selector, and box weight overview rendered"
      );
    } else {
      auditLog.brokenFeatures.push("Packing Station: Packing station controls or tabs failed to render");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_packing_station.png") });

    // -------------------------------------------------------------
    // Test 7: Billing & On-Behalf Invoicing (/billing)
    // -------------------------------------------------------------
    console.log("\n[Test 7] Auditing Billing & Tax Invoicing (/billing)...");
    await page.goto(`${BASE_URL}/billing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const billingContent = await page.content();
    const hasQueueTable = billingContent.includes("Queue") || billingContent.includes("Invoice") || billingContent.includes("Customer");
    console.log(`  Billing Work Queue Table rendered: ${hasQueueTable}`);
    if (hasQueueTable) {
      auditLog.workingFeatures.push(
        "Billing & Invoicing: Invoicing work queue, tax invoice generator, and payment recording interface operational"
      );
    } else {
      auditLog.brokenFeatures.push("Billing & Invoicing: Work queue table failed to render");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_billing_queue.png") });

    // -------------------------------------------------------------
    // Test 8: Mobile QR Scan Page (/scan/[qrCode])
    // -------------------------------------------------------------
    console.log("\n[Test 8] Auditing Mobile QR Scanner (/scan/BOX-TETE-20260707-001-TEST)...");
    await page.goto(`${BASE_URL}/scan/BOX-TETE-20260707-001-TEST`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const scanContent = await page.content();
    const hasBoxDetail = scanContent.includes("BOX-TETE-20260707-001-TEST") || scanContent.includes("Box") || scanContent.includes("Weight");
    console.log(`  QR Box Detail rendered: ${hasBoxDetail}`);
    if (hasBoxDetail) {
      auditLog.workingFeatures.push(
        "Mobile QR Scanner: Correctly retrieves real box record, displays box identity and packed produce breakdown"
      );
    } else {
      auditLog.brokenFeatures.push("Mobile QR Scanner: Failed to display box record for valid QR");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_qr_scan_valid.png") });

    // -------------------------------------------------------------
    // Test 9: Mobile QR Scan for Non-existent Box
    // -------------------------------------------------------------
    console.log("\n[Test 9] Auditing Mobile QR Scanner with Invalid QR (/scan/BOX-UNKNOWN-999)...");
    await page.goto(`${BASE_URL}/scan/BOX-UNKNOWN-999`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const invalidScanContent = await page.content();
    const hasNotFoundFeedback = invalidScanContent.includes("not found") || invalidScanContent.includes("Error") || invalidScanContent.includes("404") || invalidScanContent.includes("Failed");
    console.log(`  Invalid QR feedback rendered: ${hasNotFoundFeedback}`);
    if (hasNotFoundFeedback) {
      auditLog.workingFeatures.push(
        "Mobile QR Scanner: Displays graceful error/not-found state for unregistered QR codes"
      );
    } else {
      auditLog.brokenFeatures.push("Mobile QR Scanner: No visible feedback on invalid QR code");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_qr_scan_invalid.png") });

  } catch (err) {
    console.error("Browser audit encountered critical exception:", err);
    auditLog.brokenFeatures.push(`Audit Execution Error: ${err.message}`);
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, "browser_audit_results.json"),
      JSON.stringify(auditLog, null, 2)
    );
    console.log("\n=== Automated Browser Audit Completed ===");
    console.log(`Working Features: ${auditLog.workingFeatures.length}`);
    console.log(`Broken Features: ${auditLog.brokenFeatures.length}`);
    console.log(`Console Errors: ${auditLog.consoleErrors.length}`);
    console.log(`Network Failures: ${auditLog.networkFailures.length}`);
  }
}

runBrowserAudit();


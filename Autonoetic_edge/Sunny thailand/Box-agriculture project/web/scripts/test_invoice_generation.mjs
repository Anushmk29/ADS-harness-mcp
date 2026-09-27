import { chromium } from "@playwright/test";
import path from "path";

const BASE_URL = "http://127.0.0.1:3000";
const SCREENSHOT_DIR = path.resolve("browser-audit-screenshots");

async function testInvoiceGen() {
  console.log("=== Testing Billing Invoice Generation Flow ===");

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Log in
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill("admin@agricultureislife.com");
  await page.getByLabel("Password").fill("Admin@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.toString().includes("/login"));

  // 2. Go to /billing
  await page.goto(`${BASE_URL}/billing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Select an order from queue
  const orderSelect = page.locator("select").first();
  await orderSelect.selectOption({ index: 1 });
  await page.waitForTimeout(1000);

  // Click "Generate from final pack"
  console.log("Clicking 'Generate from final pack'...");
  const genBtn = page.getByRole("button", { name: /generate from final pack/i });
  await genBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "14_invoice_generated.png") });

  // Click "Approve and dispatch" if available
  const approveBtn = page.getByRole("button", { name: /approve and dispatch/i });
  if (await approveBtn.isVisible()) {
    console.log("Clicking 'Approve and dispatch'...");
    await approveBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "15_invoice_approved.png") });
  }

  await browser.close();
  console.log("=== Invoice Generation Test Completed ===");
}

testInvoiceGen();


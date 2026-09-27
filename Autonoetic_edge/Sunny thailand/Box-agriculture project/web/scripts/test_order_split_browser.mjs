import { chromium } from "@playwright/test";
import path from "path";

const BASE_URL = "http://127.0.0.1:3000";
const ROOT_DIR = "D:\\Autonoetic_edge\\Sunny thailand\\Box-agriculture project";
const SCREENSHOT_DIR = path.join(ROOT_DIR, "browser-audit-screenshots");
const TEST_FILE = path.join(ROOT_DIR, "outputs", "order-input-templates", "Group_Order_Matrix_Template.xlsx");

async function testSplit() {
  console.log("=== Testing Order Split Flow in Browser ===");

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

  // 2. Go to /orders
  await page.goto(`${BASE_URL}/orders`, { waitUntil: "networkidle" });
  await page.locator("select").first().selectOption({ index: 1 });
  await page.locator("input[type='file']").setInputFiles(TEST_FILE);
  await page.getByRole("button", { name: /upload & inspect/i }).click();

  // Wait for "Authorize & Split Orders"
  const splitBtn = page.getByRole("button", { name: /authorize & split orders/i });
  await splitBtn.waitFor({ state: "visible", timeout: 10000 });
  console.log("Found 'Authorize & Split Orders' button. Clicking...");
  await splitBtn.click();

  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "18_after_order_split.png") });
  console.log("Saved 18_after_order_split.png");

  await browser.close();
  console.log("=== Order Split Test Finished ===");
}

testSplit();


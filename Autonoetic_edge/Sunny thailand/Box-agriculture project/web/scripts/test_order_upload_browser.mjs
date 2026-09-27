import { chromium } from "@playwright/test";
import path from "path";

const BASE_URL = "http://127.0.0.1:3000";
const ROOT_DIR = "D:\\Autonoetic_edge\\Sunny thailand\\Box-agriculture project";
const SCREENSHOT_DIR = path.join(ROOT_DIR, "browser-audit-screenshots");
const TEST_FILE = path.join(ROOT_DIR, "outputs", "order-input-templates", "Group_Order_Matrix_Template.xlsx");

async function testUpload() {
  console.log("=== Testing Order Upload Flow in Browser ===");
  console.log(`Using file: ${TEST_FILE}`);

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
  await page.waitForTimeout(1000);

  // 3. Select Main Customer (first non-empty customer option)
  const customerSelect = page.locator("select").first();
  await customerSelect.selectOption({ index: 1 });
  console.log("Selected customer from dropdown.");

  // 4. Attach file
  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles(TEST_FILE);
  console.log("Attached file to input[type='file'].");

  // 5. Click Upload & Inspect Matrix
  const uploadBtn = page.getByRole("button", { name: /upload & inspect/i });
  console.log("Clicking 'Upload & Inspect Matrix'...");
  await uploadBtn.click();

  // Wait for upload response / validation state
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "17_after_order_upload.png") });
  console.log("Saved 17_after_order_upload.png");

  await browser.close();
  console.log("=== Order Upload Test Finished ===");
}

testUpload();


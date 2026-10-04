import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Builder, By, Button, Key } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { startDemoServer } from "../scripts/demo-server.js";

const extensionId = "absolute-scrolling@extensions.local";
const extensionUuid = "ba44ed25-7ba4-4afe-980e-c477dc7a19ce";
const popupUrl = `moz-extension://${extensionUuid}/popup/popup.html`;
let driver;
let server;
let url;

before(async () => {
  ({ server, url } = await startDemoServer());
  process.env.SE_CACHE_PATH ??= resolve("node_modules/.cache/selenium");
  process.env.SE_AVOID_STATS = "true";
  const options = new firefox.Options()
    .addArguments("-headless")
    .setPreference("general.autoScroll", true)
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [extensionId]: extensionUuid }));
  if (process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);
  const profileRoot = resolve("node_modules/.cache/firefox-profiles");
  await mkdir(profileRoot, { recursive: true });
  // Isolate application data too: macOS can protect the user's real Firefox data
  // even when geckodriver supplies a fresh profile (Mozilla bug 2060476).
  const appData = resolve("node_modules/.cache/firefox-app-data");
  await mkdir(appData, { recursive: true });
  const service = new firefox.ServiceBuilder()
    .addArguments("--profile-root", profileRoot, "--allow-system-access")
    .setEnvironment({ ...process.env, MOZ_APP_DATA: appData, MOZ_LOCAL_APP_DATA: appData });
  if (process.env.GECKODRIVER_LOG) service.enableVerboseLogging().setStdio("inherit");
  driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).setFirefoxService(service).build();
  await driver.manage().window().setRect({ width: 1200, height: 950 });
  assert.equal(await driver.installAddon(resolve("extension"), true), extensionId);
}, { timeout: 120_000 });

after(async () => {
  if (driver) await driver.quit();
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  await driver.get(url);
  await driver.actions().clear();
  await driver.executeScript("window.scrollTo({ top: 0, behavior: 'instant' })");
  // Storage is asynchronous; navigation completion usually already covers it.
  await driver.sleep(100);
});

const position = () => driver.executeScript("return document.scrollingElement.scrollTop");
const metrics = () => driver.executeScript("return { height: innerHeight, range: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight }");
const moveTo = (x, y) => driver.actions().move({ origin: "viewport", x: Math.round(x), y: Math.round(y), duration: 50 }).perform();
const press = () => driver.actions().press(Button.MIDDLE).perform();
const release = () => driver.actions().release(Button.MIDDLE).perform();
const active = () => driver.executeScript("return document.documentElement.hasAttribute('data-absolute-scrolling-active')");
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 2, `${message}: expected ${expected}, got ${actual}`);

test("20% viewport movement maps to 20% of the full scroll range and stays still", async () => {
  const { height, range } = await metrics();
  const delta = Math.round(height * 0.2);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), true);
  await moveTo(50, 130 + delta);
  near(await position(), delta / height * range, "proportional mapping");
  const stopped = await position();
  await driver.sleep(500);
  near(await position(), stopped, "holding a stationary cursor must not drift");
  await release();
  assert.equal(await active(), false);
  await moveTo(50, 130 + delta + 50);
  near(await position(), stopped, "movement after release must not scroll");
});

test("a gesture is anchored to the current position and reverses without accumulated error", async () => {
  const { height, range } = await metrics();
  const start = Math.round(range * 0.45);
  await driver.executeScript("window.scrollTo(0, arguments[0])", start);
  await moveTo(50, 350);
  await press();
  await moveTo(50, 230);
  near(await position(), start - 120 / height * range, "upward mapping");
  await moveTo(50, 350);
  near(await position(), start, "return to anchor");
  await release();
});

test("clamps at document ends and preserves the original anchor beyond a boundary", async () => {
  const { height, range } = await metrics();
  const start = Math.round(range * 0.92);
  await driver.executeScript("window.scrollTo(0, arguments[0])", start);
  await moveTo(50, 130);
  await press();
  await moveTo(50, 130 + Math.round(height * 0.4));
  near(await position(), range, "bottom clamp");
  await moveTo(50, 130);
  near(await position(), start, "anchor survives clamping");
  await release();
  await driver.executeScript("window.scrollTo(0, 20)");
  await moveTo(50, 300);
  await press();
  await moveTo(50, 100);
  near(await position(), 0, "top clamp");
  await release();
});

test("scrolls the nearest nested area using viewport height, leaving the document still", async () => {
  const data = await driver.executeScript(`
    const panel = document.querySelector('#nested');
    const rect = panel.getBoundingClientRect();
    return { x: rect.x + 50, y: rect.y + 40, range: panel.scrollHeight - panel.clientHeight, height: innerHeight };
  `);
  await moveTo(data.x, data.y);
  await press();
  await moveTo(data.x, data.y + 100);
  near(await driver.executeScript("return document.querySelector('#nested').scrollTop"), 100 / data.height * data.range, "nested range");
  near(await position(), 0, "outer document");
  await release();
});

test("smooth scrolling is bypassed and the page's inline styles are restored", async () => {
  await driver.executeScript(`
    document.documentElement.style.setProperty('scroll-behavior', 'smooth', 'important');
    document.documentElement.style.setProperty('overflow-anchor', 'auto');
  `);
  const { height, range } = await metrics();
  await moveTo(50, 130);
  await press();
  await moveTo(50, 230);
  near(await position(), 100 / height * range, "immediate position");
  await release();
  assert.deepEqual(await driver.executeScript(`
    const style = document.documentElement.style;
    return [style.getPropertyValue('scroll-behavior'), style.getPropertyPriority('scroll-behavior'), style.getPropertyValue('overflow-anchor')];
  `), ["smooth", "important", "auto"]);
});

test("Escape ends the gesture and subsequent held movement does not scroll", async () => {
  await moveTo(50, 130);
  await press();
  await moveTo(50, 200);
  const stopped = await position();
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  assert.equal(await active(), false);
  await moveTo(50, 300);
  near(await position(), stopped, "Escape stops mapping");
  await release();
});

test("middle-clicking a link still opens a tab", async () => {
  const original = await driver.getWindowHandle();
  const link = await driver.findElement(By.id("test-link"));
  await driver.actions().move({ origin: link }).press(Button.MIDDLE).release(Button.MIDDLE).perform();
  await driver.wait(async () => (await driver.getAllWindowHandles()).length === 2, 3000);
  assert.equal(await active(), false);
  const added = (await driver.getAllWindowHandles()).find((handle) => handle !== original);
  await driver.switchTo().window(added);
  await driver.close();
  await driver.switchTo().window(original);
});

test("editable fields and modified middle presses retain normal behavior", async () => {
  const input = await driver.findElement(By.id("test-input"));
  await driver.actions().move({ origin: input }).press(Button.MIDDLE).perform();
  assert.equal(await active(), false);
  await release();
  await moveTo(50, 130);
  await driver.actions().keyDown(Key.ALT).press(Button.MIDDLE).perform();
  assert.equal(await active(), false);
  await driver.actions().release(Button.MIDDLE).keyUp(Key.ALT).sendKeys(Key.ESCAPE).perform();
});

test("the range stays stable when lazy-loaded content grows during a drag", async () => {
  const { height, range } = await metrics();
  await moveTo(50, 130);
  await press();
  await moveTo(50, 230);
  const stopped = await position();
  await driver.executeScript("const extra = document.createElement('div'); extra.style.height = '4000px'; document.body.append(extra)");
  await driver.sleep(100);
  near(await position(), stopped, "content growth alone does not move scroll");
  await moveTo(50, 330);
  near(await position(), 200 / height * range, "original scale survives growth");
  await release();
});

test("scrollable elements inside an open shadow root are supported", async () => {
  await driver.executeScript(`
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:80px;top:100px;width:250px;height:400px';
    document.body.append(host);
    const shadow = host.attachShadow({mode:'open'});
    const panel = document.createElement('div');
    panel.id = 'shadow-panel';
    panel.style.cssText = 'overflow:auto;height:400px;background:white';
    const content = document.createElement('div');
    content.style.height = '2400px';
    panel.append(content);
    shadow.append(panel);
    host.id = 'shadow-host';
  `);
  const { height } = await metrics();
  await moveTo(120, 150);
  await press();
  await moveTo(120, 250);
  near(await driver.executeScript("return document.querySelector('#shadow-host').shadowRoot.querySelector('#shadow-panel').scrollTop"), 100 / height * 2000, "shadow panel");
  near(await position(), 0, "outer position");
  await release();
});

test("the extension is injected into frames and uses the frame viewport", async () => {
  await driver.executeScript(`
    const frame = document.createElement('iframe');
    frame.src = '/frame';
    frame.style.cssText = 'position:fixed;left:20px;top:80px;width:600px;height:650px;z-index:5';
    document.body.append(frame);
  `);
  const frame = await driver.findElement(By.css("iframe"));
  await driver.switchTo().frame(frame);
  await driver.wait(async () => (await metrics()).range > 1000, 3000);
  await driver.sleep(100);
  const { height, range } = await metrics();
  await moveTo(50, 180);
  await press();
  await moveTo(50, 280);
  near(await position(), 100 / height * range, "frame mapping");
  await release();
  await driver.switchTo().defaultContent();
  near(await position(), 0, "outer frame position");
});

test("non-scrollable documents leave middle mouse untouched", async () => {
  await driver.executeScript("document.body.replaceChildren(); document.body.style.height = '100vh'");
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), false);
  await release();
});

test("popup preferences persist and immediately apply to already-open pages", async () => {
  const pageHandle = await driver.getWindowHandle();
  await driver.switchTo().newWindow("tab");
  const popupHandle = await driver.getWindowHandle();
  // WebDriver blocks direct moz-extension navigation from content context.
  // Use the browser's own navigation in this disposable test profile.
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(`
    gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  `, popupUrl);
  await driver.setContext(firefox.Context.CONTENT);
  await driver.wait(async () => (await driver.getCurrentUrl()) === popupUrl, 3000);
  await driver.wait(async () => (await driver.findElement(By.id("enabled"))).isEnabled(), 3000);
  await driver.findElement(By.id("enabled")).click();
  await driver.wait(async () => (await driver.findElement(By.id("status")).getText()) === "Scrolling paused", 3000);
  await driver.switchTo().window(pageHandle);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), false);
  await release();
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  await driver.switchTo().window(popupHandle);
  await driver.navigate().refresh();
  assert.equal(await driver.findElement(By.id("enabled")).isSelected(), false);
  await driver.findElement(By.id("enabled")).click();
  await driver.findElement(By.id("sensitivity")).sendKeys(Key.HOME, Key.ARROW_RIGHT); // 0.5×
  await driver.wait(async () => (await driver.executeScript("return browser.storage.local.get('sensitivity')")).sensitivity === 0.5, 3000);
  await driver.switchTo().window(pageHandle);
  const { height, range } = await metrics();
  await moveTo(50, 130);
  await press();
  await moveTo(50, 230);
  near(await position(), 100 / height * range * 0.5, "saved sensitivity");
  await release();
  await driver.switchTo().window(popupHandle);
  await driver.executeScript("return browser.storage.local.set({ enabled: true, sensitivity: 1 })");
  await driver.navigate().refresh();
  await driver.wait(async () => (await driver.findElement(By.id("enabled"))).isEnabled(), 3000);
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/popup.png", await driver.takeScreenshot(), "base64");
  await driver.close();
  await driver.switchTo().window(pageHandle);
  await driver.get(url);
  await writeFile("test-results/demo.png", await driver.takeScreenshot(), "base64");
});

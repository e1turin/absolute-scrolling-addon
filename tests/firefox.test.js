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
  await driver.manage().setTimeouts({ pageLoad: 15_000, script: 10_000 });
  await driver.manage().window().setRect({ width: 1200, height: 950 });
  assert.equal(await driver.installAddon(resolve("extension"), true), extensionId);
}, { timeout: 120_000 });

after(async () => {
  if (driver) await driver.quit();
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  await driver.setContext(firefox.Context.CONTENT);
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
const setNumberInput = (id, value) => driver.executeScript(`
  const input = document.getElementById(arguments[0]);
  input.value = arguments[1];
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
`, id, String(value));

async function openSettingsTab() {
  await driver.switchTo().newWindow("tab");
  const handle = await driver.getWindowHandle();
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(`
    gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  `, popupUrl);
  await driver.setContext(firefox.Context.CONTENT);
  await driver.wait(async () => (await driver.getCurrentUrl()) === popupUrl, 3000);
  await driver.wait(async () => (await driver.findElement(By.id("enabled"))).isEnabled(), 3000);
  return handle;
}

async function openSettingsForPage() {
  const pageUrl = await driver.getCurrentUrl();
  const controller = await openSettingsTab();
  const handles = await driver.getAllWindowHandles();
  // Firefox WebDriver cannot enter a remote toolbar popup. Open its unmodified
  // page in a background tab so initialization reads the actual active webpage,
  // just as it does when the toolbar opens it, then switch there to test controls.
  await driver.executeScript(`
    return (async () => {
      const tabs = await browser.tabs.query({ currentWindow: true });
      const page = tabs.find(tab => tab.url === arguments[0]);
      await browser.tabs.update(page.id, { active: true });
      await browser.tabs.create({ url: arguments[1], active: false });
    })();
  `, pageUrl, popupUrl);
  await driver.sleep(200);
  const handle = (await driver.getAllWindowHandles()).find(value => !handles.includes(value));
  await driver.switchTo().window(controller);
  await driver.close();
  await driver.switchTo().window(handle);
  await driver.wait(async () => (await driver.findElement(By.id("enabled"))).isEnabled(), 3000);
  return handle;
}

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
  await driver.wait(async () => (await metrics())?.range > 1000, 3000);
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

test("horizontal document movement maps to full width and reverses without drift", async () => {
  await driver.executeScript("document.body.style.width = '5000px'");
  const { width, range } = await driver.executeScript("return { width: innerWidth, range: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth }");
  const delta = Math.round(width * 0.2);
  await moveTo(50, 130);
  await press();
  await moveTo(50 + delta, 130);
  const x = await driver.executeScript("return scrollX");
  near(x, 0.2 * range * 4, "default 4× horizontal mapping");
  near(await position(), 0, "horizontal movement must not move vertically");
  await driver.sleep(250);
  near(await driver.executeScript("return scrollX"), x, "stationary horizontal hold");
  await moveTo(50, 130);
  near(await driver.executeScript("return scrollX"), 0, "horizontal anchor");
  await release();
  await moveTo(50 + delta, 130);
  near(await driver.executeScript("return scrollX"), 0, "horizontal release");
});

test("diagonal gestures use each axis's range and viewport dimension", async () => {
  await driver.executeScript("document.body.style.width = '5000px'");
  const data = await driver.executeScript("return { width: innerWidth, height: innerHeight, x: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth, y: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight }");
  await moveTo(50, 130);
  await press();
  await moveTo(170, 230);
  near(await driver.executeScript("return scrollX"), 120 / data.width * data.x * 4, "diagonal x");
  near(await position(), 100 / data.height * data.y, "diagonal y");
  await release();
});

test("horizontal-only nested panels are selected and never chain to the outer document", async () => {
  await driver.executeScript(`
    const panel = document.querySelector('#nested');
    panel.style.cssText = 'overflow-x:auto;overflow-y:hidden';
    panel.replaceChildren();
    const content = document.createElement('div');
    content.style.cssText = 'width:2000px;height:100px';
    panel.append(content);
  `);
  const data = await driver.executeScript("const panel = document.querySelector('#nested'), rect = panel.getBoundingClientRect(); return { x:rect.x+30, y:rect.y+40, range:panel.scrollWidth-panel.clientWidth, width:innerWidth }");
  await moveTo(data.x, data.y);
  await press();
  await moveTo(data.x + 100, data.y + 40);
  near(await driver.executeScript("return document.querySelector('#nested').scrollLeft"), 100 / data.width * data.range * 4, "nested horizontal mapping");
  near(await position(), 0, "outer vertical unchanged");
  await release();
});

test("RTL horizontal ranges support negative scrollLeft and clamp at the far edge", async () => {
  await driver.executeScript(`
    const panel = document.querySelector('#nested');
    panel.style.cssText = 'position:fixed;left:80px;top:120px;width:400px;overflow-x:auto;overflow-y:hidden;direction:rtl';
    panel.replaceChildren();
    const content = document.createElement('div');
    content.style.cssText = 'width:2000px;height:100px';
    panel.append(content);
  `);
  const { width, range } = await driver.executeScript("const panel = document.querySelector('#nested'); return { width:innerWidth, range:panel.scrollWidth-panel.clientWidth }");
  await moveTo(350, 180);
  await press();
  await moveTo(230, 180);
  near(await driver.executeScript("return document.querySelector('#nested').scrollLeft"), -120 / width * range * 4, "RTL negative mapping");
  await moveTo(350, 180);
  near(await driver.executeScript("return document.querySelector('#nested').scrollLeft"), 0, "RTL anchor");
  await release();
  await driver.executeScript("document.querySelector('#nested').scrollLeft = arguments[0]", -range * 0.95);
  await moveTo(350, 180);
  await press();
  await moveTo(100, 180);
  near(await driver.executeScript("return document.querySelector('#nested').scrollLeft"), -range, "RTL end clamp");
  await release();
});

test("popup patterns validate, persist, disable matching pages, and re-enable them on removal", async () => {
  const pageHandle = await driver.getWindowHandle();
  const popupHandle = await openSettingsTab();
  const input = await driver.findElement(By.id("pattern"));
  await input.sendKeys("https://", Key.ENTER);
  assert.equal(await driver.findElement(By.id("pattern-error")).isDisplayed(), true);
  await input.clear();
  await input.sendKeys(`${url}/`, Key.ENTER);
  await driver.wait(async () => (await driver.findElements(By.css("#patterns li"))).length === 1, 3000);
  await setNumberInput("horizontal-sensitivity", 8);
  await driver.navigate().refresh();
  await driver.wait(async () => (await driver.findElements(By.css("#patterns li"))).length === 1, 3000);
  await driver.switchTo().window(pageHandle);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), false, "saved rule applies to an already-open page");
  await release();
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  await driver.get(`${url}/link`);
  await driver.sleep(100);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), true, "another path remains enabled");
  await release();
  await driver.get(`${url}/?view=2#section`);
  await driver.sleep(100);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), false, "query and fragment do not bypass the exclusion");
  await release();
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  await driver.switchTo().window(popupHandle);
  await driver.findElement(By.css("#patterns button")).click();
  await driver.wait(async () => (await driver.findElements(By.css("#patterns li"))).length === 0, 3000);
  await driver.executeScript("return browser.storage.local.set({ verticalSensitivity: 1, horizontalSensitivity: 4 })");
  await driver.close();
  await driver.switchTo().window(pageHandle);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), true, "removing a rule re-enables the current page immediately");
  await release();
});

test("current-page shortcuts add removable page and whole-site rules", async () => {
  await driver.get(`${url}/link?view=2#section`);
  const pageHandle = await driver.getWindowHandle();
  await openSettingsForPage();
  assert.equal(await driver.findElement(By.id("pattern")).getAttribute("value"), `${url}/link`);
  await driver.findElement(By.id("disable-page")).click();
  await driver.wait(async () => (await driver.findElement(By.id("page-state")).getText()) === "Disabled on this page", 3000);
  assert.equal(await driver.findElement(By.css("#patterns code")).getText(), `${url}/link`);
  await driver.close();
  await driver.switchTo().window(pageHandle);
  await moveTo(50, 130);
  await press();
  assert.equal(await active(), false);
  await release();
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  await openSettingsForPage();
  await driver.findElement(By.css("#patterns button")).click();
  await driver.wait(async () => (await driver.findElements(By.css("#patterns li"))).length === 0, 3000);
  await driver.findElement(By.id("disable-site")).click();
  await driver.wait(async () => (await driver.findElement(By.css("#patterns code")).getText()) === `${url.replace('http:', '*:')}/*`, 3000);
  await driver.findElement(By.css("#patterns button")).click();
  await driver.wait(async () => (await driver.findElements(By.css("#patterns li"))).length === 0, 3000);
  await driver.close();
  await driver.switchTo().window(pageHandle);
});

test("exclusions cover cross-origin frames and follow single-page app navigation", async () => {
  const pageHandle = await driver.getWindowHandle();
  const popupHandle = await openSettingsTab();
  await driver.executeScript("return browser.storage.local.set({ disabledPatterns: [arguments[0]] })", `${url}/link`);
  await driver.switchTo().window(pageHandle);
  const crossOrigin = url.replace("127.0.0.1", "localhost");
  await driver.executeScript(`
    const frame = document.createElement('iframe');
    frame.src = arguments[0] + '/frame';
    frame.style.cssText = 'position:fixed;left:20px;top:80px;width:600px;height:650px;z-index:5';
    document.body.append(frame);
  `, crossOrigin);
  await driver.switchTo().frame(await driver.findElement(By.css("iframe")));
  await driver.wait(async () => (await metrics())?.range > 1000, 3000);
  await driver.sleep(150);
  await moveTo(50, 180);
  await press();
  assert.equal(await active(), true);
  await release();
  await driver.switchTo().defaultContent();
  await driver.executeScript("history.pushState({}, '', '/link')");
  await driver.sleep(150);
  await driver.switchTo().frame(await driver.findElement(By.css("iframe")));
  await moveTo(50, 180);
  await press();
  assert.equal(await active(), false, "the excluded top URL disables its cross-origin frame");
  await release();
  await driver.actions().sendKeys(Key.ESCAPE).perform();
  await driver.switchTo().defaultContent();
  await driver.executeScript("history.pushState({}, '', '/')");
  await driver.sleep(150);
  await driver.switchTo().frame(await driver.findElement(By.css("iframe")));
  await moveTo(50, 180);
  await press();
  assert.equal(await active(), true, "leaving an excluded SPA route re-enables the frame");
  await release();
  await driver.switchTo().defaultContent();
  await driver.switchTo().window(popupHandle);
  await driver.executeScript("return browser.storage.local.set({ disabledPatterns: [] })");
  await driver.close();
  await driver.switchTo().window(pageHandle);
});

test("popup preferences persist and immediately apply to already-open pages", async () => {
  const pageHandle = await driver.getWindowHandle();
  const popupHandle = await openSettingsTab();
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
  await setNumberInput("vertical-sensitivity", 0.5);
  await driver.wait(async () => (await driver.executeScript("return browser.storage.local.get('verticalSensitivity')")).verticalSensitivity === 0.5, 3000);
  await setNumberInput("horizontal-sensitivity", 6.25);
  await driver.wait(async () => (await driver.executeScript("return browser.storage.local.get('horizontalSensitivity')")).horizontalSensitivity === 6.25, 3000);
  await driver.switchTo().window(pageHandle);
  const { height, range } = await metrics();
  await moveTo(50, 130);
  await press();
  await moveTo(50, 230);
  near(await position(), 100 / height * range * 0.5, "saved vertical multiplier");
  await release();
  await driver.executeScript("document.body.style.width = '5000px'");
  const horizontal = await driver.executeScript("return { width: innerWidth, range: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth }");
  await moveTo(50, 130);
  await press();
  await moveTo(150, 130);
  near(await driver.executeScript("return scrollX"), 100 / horizontal.width * horizontal.range * 6.25, "saved horizontal multiplier");
  await release();
  await driver.switchTo().window(popupHandle);
  await driver.executeScript("return browser.storage.local.set({ enabled: true, verticalSensitivity: 1, horizontalSensitivity: 4 })");
  await driver.navigate().refresh();
  await driver.wait(async () => (await driver.findElement(By.id("enabled"))).isEnabled(), 3000);
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/popup.png", await driver.takeScreenshot(), "base64");
  await driver.executeScript("document.body.scrollTop = document.body.scrollHeight");
  await writeFile("test-results/popup-patterns.png", await driver.takeScreenshot(), "base64");
  await driver.close();
  await driver.switchTo().window(pageHandle);
  await driver.get(url);
  await writeFile("test-results/demo.png", await driver.takeScreenshot(), "base64");
});

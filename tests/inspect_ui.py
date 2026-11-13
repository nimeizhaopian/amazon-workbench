from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1100}, device_scale_factor=1)
    page.goto("http://127.0.0.1:4810", wait_until="networkidle")
    page.get_by_role("heading", name="运营概览", exact=True).wait_for()
    page.screenshot(path=str(ROOT / "codex-artifacts" / "overview.png"), full_page=True)
    print(page.locator("body").inner_text()[:5000])
    print("Horizontal overflow:", page.evaluate("document.documentElement.scrollWidth > innerWidth"))
    browser.close()

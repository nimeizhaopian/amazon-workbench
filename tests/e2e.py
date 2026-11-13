"""通过真实浏览器验证本地工作台；只操作虚构演示店铺。"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "codex-artifacts"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1050}, device_scale_factor=1, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:4810", wait_until="networkidle")
    expect(page.get_by_role("heading", name="运营概览", exact=True)).to_be_visible()
    expect(page.get_by_text("演示模式", exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / "overview.png"), full_page=True)
    print("PASS overview and explicit demo labels")

    page.get_by_role("button", name="生成运营日报", exact=True).click()
    dialog = page.get_by_role("dialog", name="新建运营任务")
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="开始执行", exact=True).click()
    report = page.get_by_role("dialog", name="任务报告")
    expect(report.get_by_text("已完成", exact=True)).to_be_visible(timeout=15000)
    expect(report.get_by_text("规则分析，未调用大模型", exact=True)).to_be_visible()
    with page.expect_download() as download_event:
        report.get_by_role("link", name="导出 CSV").click()
    download = download_event.value
    download.save_as(str(ARTIFACTS / "report.csv"))
    exported = (ARTIFACTS / "report.csv").read_text(encoding="utf-8-sig")
    assert "演示数据" in exported and "NL-BTL-750" in exported
    page.screenshot(path=str(ARTIFACTS / "report.png"), full_page=True)
    report.get_by_role("button", name="关闭", exact=True).click()
    print("PASS report creation, completion and CSV download")

    page.get_by_role("button", name="商品与库存", exact=True).click()
    page.get_by_role("textbox", name="筛选商品", exact=True).fill("NL-BTL-750")
    expect(page.locator("tbody tr")).to_have_count(1)
    page.get_by_role("button", name="查看 真空保温随行杯 · 750ml", exact=True).click()
    product = page.get_by_role("dialog", name="商品详情与本地草稿")
    product.get_by_label("修改后的标题").fill("Northline Insulated Water Bottle, 750ml, Leakproof Lid — Local Draft")
    product.get_by_role("button", name="保存本地草稿", exact=True).click()
    expect(product).not_to_be_visible()
    page.get_by_role("button", name="本地草稿", exact=True).click()
    expect(page.locator("tbody tr")).to_have_count(1)
    page.get_by_role("button", name="查看 真空保温随行杯 · 750ml", exact=True).click()
    expect(product.get_by_label("修改后的标题")).to_have_value("Northline Insulated Water Bottle, 750ml, Leakproof Lid — Local Draft")
    product.get_by_role("button", name="关闭", exact=True).click()
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="商品与库存", exact=True).click()
    page.get_by_role("button", name="本地草稿", exact=True).click()
    expect(page.locator("tbody tr")).to_have_count(1)
    page.get_by_label("选择店铺").select_option("demo-de")
    expect(page.get_by_text("没有匹配的商品", exact=True)).to_be_visible()
    page.get_by_label("选择店铺").select_option("demo-us")
    page.get_by_role("button", name="全部商品", exact=True).click()
    expect(page.locator("tbody tr")).to_have_count(8)
    page.screenshot(path=str(ARTIFACTS / "products.png"), full_page=True)
    print("PASS draft persistence, search and store isolation")

    page.get_by_role("button", name="连接器", exact=True).click()
    expect(page.get_by_text("接口已预留", exact=True)).to_be_visible()
    bird_card = page.locator(".connector-card").filter(has=page.get_by_role("heading", name="紫鸟浏览器", exact=True))
    bird_card.get_by_role("button", name="配置说明").click()
    setup = page.get_by_role("dialog", name="连接器配置")
    expect(setup.get_by_text("ZINIAO_PASSWORD", exact=True)).to_be_visible()
    setup.get_by_role("button", name="检测连接").click()
    expect(page.get_by_role("status")).to_contain_text("尚未启用")
    setup.get_by_role("button", name="关闭", exact=True).click()
    page.screenshot(path=str(ARTIFACTS / "connectors.png"), full_page=True)
    print("PASS connector setup and disabled Ziniao behavior")

    page.get_by_role("navigation").get_by_role("button", name="智能助手").click()
    frame_element = page.locator('iframe[title="DeepSeek Harness 智能助手"]')
    expect(frame_element).to_be_visible(timeout=30000)
    native_frame = frame_element.element_handle().content_frame()
    native_frame.wait_for_load_state("networkidle", timeout=30000)
    native_text = native_frame.locator("body").inner_text()
    assert "authentication required" not in native_text.lower(), native_text[:300]
    assert len(native_text.strip()) > 20, "DSH interface did not render"
    print("DSH body:", native_text[:1800])
    page.screenshot(path=str(ARTIFACTS / "assistant.png"), full_page=True)
    print("PASS embedded native DSH interface")

    page.get_by_role("button", name="运营概览", exact=True).click()
    page.set_viewport_size({"width": 390, "height": 844})
    expect(page.get_by_role("heading", name="运营概览", exact=True)).to_be_visible()
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile page overflows"
    page.screenshot(path=str(ARTIFACTS / "mobile.png"), full_page=True)
    print("PASS mobile layout")
    assert not errors, errors
    print("PASS no unhandled browser exceptions")
    (ARTIFACTS / "e2e-results.json").write_text(json.dumps({"passed":True,"flows":7,"browserErrors":errors},ensure_ascii=False,indent=2),encoding="utf-8")
    context.close()
    browser.close()

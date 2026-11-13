# AW · 亚马逊运营工作台

一个放在 D:\other\aw 的完整本地项目：React 业务界面、Node 服务、SQLite 数据、DeepSeek Harness 插件及 MCP 接口。运行时从本项目的 node_modules 安装，不依赖 D:\other\deepseekharness 的源码或全局 DSH 配置。

## 已实现

- 运营概览、商品搜索与库存筛选、任务中心、报告预览及 CSV 导出。
- 库存日报、Listing 基础检查、补货建议三个确定性规则工作流。规则报告明确标注“未调用大模型”。
- Listing 标题的修改对比和本地草稿持久化；不提交 Amazon 修改。
- 原生 DeepSeek Harness Web 通过同源代理嵌入智能助手，注册 5 个工作台工具。
- Amazon SP-API 的 LWA 授权、完整 FBA 库存分页读取、连接检测。
- 紫鸟社区 MCP 的配置、启用开关与工具枚举检测；默认关闭。
- 对外提供 4 个只读或生成本地报告的 Amazon 工作台 MCP 工具。

## 启动

需要 Node.js >=24.9.0（当前验证使用 24.16.0），以及 npm。

~~~powershell
Set-Location -LiteralPath 'D:\other\aw'
npm ci
npm run build
npm start
~~~

打开 http://127.0.0.1:4810 。工作台会自动启动项目内的 DSH，默认内部端口为 3088。进入“智能助手”可以看到官方 DSH 界面，首次使用按提示配置模型。未配置 API Key 时可以使用演示数据、规则任务和本地草稿；自然语言模型任务需要有效模型凭据。

开发：npm run dev。前端热更新由 Vite 提供；修改后端后需重新启动。

Windows 也可以运行 scripts/start.ps1。需要隐藏窗口启动时运行 scripts/start-background.ps1；停止由该脚本启动的实例使用 scripts/stop.ps1。前台运行时使用 Ctrl+C。

## 演示与真实数据

默认提供三个独立的虚构店铺：demo-us、demo-de、demo-uk。所有响应、页面、任务和导出都标记来源。它们不会访问 Amazon 或紫鸟。

~~~powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env'
~~~

如果已有 .env，请直接编辑，不要覆盖已有凭据。

在 .env 填写 AMAZON_LWA_CLIENT_ID、AMAZON_LWA_CLIENT_SECRET、AMAZON_REFRESH_TOKEN、AMAZON_SELLER_ID、AMAZON_MARKETPLACE。重启后会出现一个独立的真实店铺，先在“连接器”检测授权，再选择它。当前单组授权支持 US、DE、UK 之一。

真实接口当前只读取 FBA 库存。该接口不提供价格和逐 SKU 销量，所以销售额、订单数、库存覆盖和补货数量保留为未知，不用演示数据替代。真实接口失败会明确报错。真实销量报表、广告接口、Listing 写回和多账户授权是后续扩展项。

## DeepSeek Harness

固定版本：@deepseek-ai/dsh 0.2.2-rc.1。运行状态和配置全部保存在项目 .dsh 目录；插件覆盖配置由 scripts/start-dsh.mjs 根据当前路径生成。

智能助手中的原生工具：

| 工具 | 行为 |
|---|---|
| aw_list_stores | 列出店铺及数据来源 |
| aw_inventory | 读取指定店铺商品与库存 |
| aw_create_report | 生成规则报告并写入任务中心 |
| aw_get_report | 获取任务进度及结果 |
| aw_save_listing_draft | 保存本地标题草稿 |

可以复制页面上的“当前店铺日报指令”，粘贴到 DSH 对话。也可以直接输入：

> 请先调用 aw_inventory 查看 demo-us 的库存，再用 aw_create_report 生成 inventory_daily 日报。不要补造缺失数据。

DSH 的首次访问令牌只在服务进程内持有；同源 iframe 完成其原生登录流程，日志中抹去令牌。工作台 API 与插件之间还有独立的本机令牌。

## 紫鸟

见 docs/ziniao.md。界面的“接口已预留”不表示已经连接：默认不会安装或启动 ziniao-mcp，也不会操作已登录店铺。只有显式配置并开启 ZINIAO_ENABLED 后，DSH 才装载该 MCP。

## 目录

~~~text
aw/
  web/                         React 业务界面
  server/                      HTTP API、业务规则、SQLite
    connectors/amazon.mjs      Amazon LWA / FBA 库存
    connectors/index.mjs       连接器状态与紫鸟探测
  plugins/amazon-workbench/    原生 DSH 工具插件
  connectors/mcp-server.mjs    工作台 MCP stdio 服务
  config/mcp.example.json      MCP 示例（不含真实密钥）
  scripts/                     DSH 与 Windows 启停
  tests/                       Node 测试、浏览器验收、MCP 验证
  docs/                        架构、连接器与验证说明
  .env.example                 环境变量模板
  .data/                       本地数据库与工具令牌（忽略）
  .dsh/                        项目独立 DSH 运行状态（忽略）
  codex-artifacts/              运行日志、截图和验收产物（忽略）
~~~

## 验证

~~~powershell
npm test
npm run build
# 以下需要工作台已经在 4810 端口运行
node tests/mcp-smoke.mjs
# 浏览器验收需要 Python、Playwright 和本机 Microsoft Edge
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r tests/requirements.txt
.venv\Scripts\python.exe tests/e2e.py
~~~

服务只监听 127.0.0.1，当前定位为本机单用户工作台。不要将此版本直接暴露到公网。节点测试使用独立临时数据库；浏览器验收会在虚构店铺里留下本地报告和草稿。

## 来源与版本

- DeepSeek 官方：https://github.com/deepseek-ai/deepseek-harness
- 亚马逊库存参考：https://developer-docs.amazon.com/sp-api/reference/getinventorysummaries
- 紫鸟官方 WebDriver：https://open.ziniao.com/docSupport?docId=99
- 紫鸟社区发布包：https://pypi.org/project/ziniao-mcp/0.1.33/

业务界面及适配代码为本项目实现，没有复制两款社区选品插件。Sorftime、卖家精灵等第三方选品数据尚未接入。

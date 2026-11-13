# 架构与扩展点

## 执行路径

浏览器业务页面通过 /api 请求本地服务。服务持有 SQLite、规则工作流和 Amazon 连接器，统一计算货币展示、库存覆盖、任务状态及数据来源。React 负责展示、筛选、交互和加载状态。

“智能助手”使用 /harness/ 同源代理嵌入官方 DSH。scripts/start-dsh.mjs 使用项目自己的 npm 依赖和 .dsh 目录，加载 plugins/amazon-workbench/index.mjs。插件调用经过令牌校验的 /api/agent 路由；任务结果因此与业务页面共享同一数据库。

另一个 stdio 入口 connectors/mcp-server.mjs 供其他 MCP 客户端调用相同业务 API。使用 config/mcp.example.json 时，可只保留 amazonWorkbench 配置项。

## 业务对象

- Store：包含来源、站点和货币。当前不会把不同币种跨店铺相加。
- Snapshot：数据采集结果。真实缺失值为 null，读取失败不降级到演示。
- Task：running / completed / failed，带来源、步骤和最终报告。启动时将上次中断的 running 任务改为 failed。
- Draft：按店铺、SKU 持久化的本地草稿，不等同于远端已发布商品。

## 扩展真实数据

当前 AmazonConnector 只有 LWA 与 FBA 库存读取。后续可以增加一个销售数据提供者，用明确日期范围读取授权报表，再按 SKU 关联；在此之前，不推算真实销量与补货数量。

增加真实写入时，建立独立的修改草稿、用户确认、提交结果和回读核对流程，再添加对应的 DSH 工具。不要把“保存本地草稿”改为隐式远端写入。

广告管理单独连接 Amazon Ads API。第三方选品数据可以独立增加 MCP，保留各自的来源与统计口径。

## 本地运行边界

本版本不提供公网身份登录和多租户权限；监听地址固定为 loopback。业务写请求要求同源及自定义请求标识，Agent 接口使用独立令牌。密钥只从环境变量或 DSH 原生设置读取，API 只返回是否配置，不返回密钥值。

DSH 反向代理不经过工作台 JSON body parser，防止代理请求体被提前消费。其首次访问认证仍由 DSH 处理，工作台只衔接本地初始化 URL。

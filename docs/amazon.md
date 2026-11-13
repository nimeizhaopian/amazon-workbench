# Amazon SP-API 接入

## 当前范围

使用官方 Login With Amazon refresh token 流程，读取 /fba/inventory/v1/summaries。地域由已配置 Marketplace 决定，当前支持 US（NA）、DE（EU）、UK（EU）。凭据需具备目标店铺、目标站点及相应角色权限。

.env 中填写：

~~~dotenv
AMAZON_LWA_CLIENT_ID=
AMAZON_LWA_CLIENT_SECRET=
AMAZON_REFRESH_TOKEN=
AMAZON_SELLER_ID=
AMAZON_MARKETPLACE=US
~~~

配置完整后出现真实店铺。响应不包含 access token、refresh token 或 client secret。授权响应及上游错误正文不回传浏览器。

库存读取会遍历所有返回分页；重复令牌、分页超限或中途失败直接报告错误，不把部分数据标记为完整。当前上限为 100 页，可根据店铺规模扩展成异步采集任务。access token 在连接器实例中缓存至到期前 60 秒。

## 数据口径

- 可售库存：inventoryDetails.fulfillableQuantity。
- 在途库存：working、shipped、receiving 三项之和。
- sales7、price、revenue、orders：库存接口不提供，保留 null。
- 无销量的商品显示“待评估”；可售库存为零仍触发缺货提醒。
- 补货建议必须有逐 SKU 销量，缺少时明确说明无法计算。

未接入真实订单、销售报表、Listing 发布、价格更新与 Amazon Ads。当前不会向店铺写入。

## 与 AWS MCP 示例的关系

研究参考：https://github.com/aws-samples/sample-amazon-spapi-mcp-server 。第一版直接封装官方只读库存接口，再通过本项目 connectors/mcp-server.mjs 暴露为 MCP，以减少本地启动依赖。没有把该 AWS PoC 复制成生产服务，也没有宣称已经支持其所有工具。

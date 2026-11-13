# 紫鸟连接器

## 已核对的资料

紫鸟官方提供 WebDriver 权限与自动化说明：https://open.ziniao.com/docSupport?docId=99 。官方示例仓库为 https://github.com/Superbrowser/ClientPlaywright-Python 。

社区包 ziniao-mcp 在 PyPI 上发布了 0.1.33，提供 stdio MCP、紫鸟店铺与本地 Chrome 操作。作者列出的 GitHub 地址是 https://github.com/tianyehedashu/ziniao-mcp；本次检索该 GitHub 页面返回 404，因此本项目根据可获取的发布包说明预留适配，没有把它称为紫鸟官方 MCP，也未验证它对你本机客户端的兼容性。

## 配置

先安装紫鸟客户端，开通官方 WebDriver 权限，并准备 uv / uvx。编辑项目 .env：

~~~dotenv
ZINIAO_ENABLED=true
ZINIAO_MCP_COMMAND=uvx
ZINIAO_MCP_ARGS=["ziniao-mcp==0.1.33"]
ZINIAO_COMPANY=你的企业名
ZINIAO_USERNAME=你的用户名
ZINIAO_PASSWORD=你的密码
ZINIAO_CLIENT_PATH=D:\实际安装目录\ziniao.exe
ZINIAO_VERSION=v6
~~~

启动参数按照社区包文档，固定版本而非每次追随 latest。源码不会保存真实账户；.env 和 DSH 运行目录被 Git 忽略。

重新启动工作台后，DSH 通过官方 mcp-client 装载紫鸟服务，工具使用 mcp__ziniao__ 前缀。配置生成器只写环境变量引用，不把密码复制到 YAML。进入“连接器 → 紫鸟浏览器 → 检测连接”可以进行 MCP 握手并枚举工具；检测成功只说明协议可用，不等于店铺登录或每个页面操作已验证。

## 默认行为

ZINIAO_ENABLED=false。默认不下载、不启动第三方 MCP、不打开紫鸟，也不枚举真实店铺。配置页展示必要字段的填写状态。未启用时点击检测会明确提示缺失配置。

首个实际验收建议是先读取店铺列表和打开指定店铺，再验证页面截图。商品修改、价格、订单等操作应按具体业务设计确认与结果核对。

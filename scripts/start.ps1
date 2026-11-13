# 固定从项目根目录启动，使数据库与运行配置始终保存在 aw 目录。
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm start

# 只停止由本项目后台脚本启动且命令行路径匹配的进程，避免误停其他 Node 服务。
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'codex-artifacts\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output '没有找到本项目的后台 PID 记录。'; exit 0 }
$recordedPid = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$serverProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $recordedPid)
if (-not $serverProcess) { Write-Output '记录的服务已停止。'; exit 0 }
$serverFile = Join-Path $projectRoot 'server\index.mjs'
if (-not $serverProcess.CommandLine.Contains($serverFile)) { throw 'PID 对应进程路径与本项目不符，拒绝停止。前台启动的服务请用 Ctrl+C 退出。' }
$children = Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $recordedPid)
$dshFile = Join-Path $projectRoot 'node_modules\@deepseek-ai\dsh\lib\bin.js'
foreach ($child in $children) { if ($child.CommandLine -and $child.CommandLine.Contains($dshFile)) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue } }
Stop-Process -Id $recordedPid -ErrorAction SilentlyContinue
Write-Output '本项目后台工作台与 DSH 已停止。'

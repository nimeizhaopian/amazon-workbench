# 只启动本项目服务，窗口保持隐藏；保存 PID 供 stop.ps1 核对后停止。
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$existingPidFile = Join-Path $projectRoot 'codex-artifacts\server.pid'
if (Test-Path -LiteralPath $existingPidFile) {
    $existingPid = [int](Get-Content -LiteralPath $existingPidFile -Raw).Trim()
    $existingProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $existingPid)
    if ($existingProcess -and $existingProcess.CommandLine.Contains((Join-Path $projectRoot 'server\index.mjs'))) { Write-Output '本项目已经在后台运行。'; exit 0 }
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) { npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$artifactDir = Join-Path $projectRoot 'codex-artifacts'
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$nodeBinary = (Get-Command node).Source
$serverFile = Join-Path $projectRoot 'server\index.mjs'
$arguments = @('--env-file-if-exists=.env', ('"' + $serverFile + '"'))
$process = Start-Process -FilePath $nodeBinary -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactDir 'server.log') -RedirectStandardError (Join-Path $artifactDir 'server-error.log') -PassThru
if ($process.WaitForExit(800)) { throw '服务未能启动，请查看 codex-artifacts/server-error.log。' }
$process.Id | Set-Content -LiteralPath (Join-Path $artifactDir 'server.pid')
Write-Output ('已启动工作台，PID: ' + $process.Id + '。启动结果见 codex-artifacts/server.log。')

<#
.SYNOPSIS
  Install one DSH Codex agent preset into this machine's user preset root.

.DESCRIPTION
  The default remains codex-mode. Select the hybrid explicitly with
  -Preset codex-ptc-mode. Nothing is overwritten without -Force, and -Force
  keeps a timestamped recoverable backup instead of deleting the prior install.

.PARAMETER Preset
  Preset id to install: codex-mode (default) or codex-ptc-mode.

.PARAMETER Force
  Overwrite an existing preset with the same id (the old directory is backed up first).

.PARAMETER Dest
  Preset root directory. Defaults to $env:DSH_HOME\.agent-presets or $HOME\.dsh\.agent-presets.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Preset codex-ptc-mode -Force
#>
[CmdletBinding()]
param(
    [ValidateSet('codex-mode', 'codex-ptc-mode')]
    [string]$Preset = 'codex-mode',
    [switch]$Force,
    [string]$Dest
)

$ErrorActionPreference = 'Stop'
$presetId = $Preset

# Resolve the source next to this script so the installer works from any cwd.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $scriptDir (Join-Path 'presets' $presetId)

if (-not (Test-Path -LiteralPath (Join-Path $src 'agent.cordis.yml') -PathType Leaf)) {
    Write-Error "install: 找不到预设源文件 $src\agent.cordis.yml。请在克隆出来的仓库目录里运行这个脚本。"
}

if ([string]::IsNullOrWhiteSpace($Dest)) {
    # An empty or whitespace-only DSH_HOME is treated as unset, the same way DSH does.
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) {
        $destRoot = Join-Path $env:DSH_HOME '.agent-presets'
    } else {
        $home = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
        $destRoot = Join-Path (Join-Path $home '.dsh') '.agent-presets'
    }
} else {
    $destRoot = $Dest
}

$target = Join-Path $destRoot $presetId

if (Test-Path -LiteralPath $target) {
    if (-not $Force) {
        Write-Error "install: $target 已存在。要更新请加 -Force（旧目录会备份）。"
    }
    $backupBase = "$target.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    $backup = $backupBase
    $backupSuffix = 0
    while (Test-Path -LiteralPath $backup) {
        $backupSuffix += 1
        $backup = "$backupBase.$backupSuffix"
    }
    Move-Item -LiteralPath $target -Destination $backup
    Write-Host "install: 旧版本已备份到 $backup"
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -LiteralPath $src -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
}

$displayName = if ($presetId -eq 'codex-ptc-mode') { 'Codex PTC 模式' } else { 'Codex 模式' }
Write-Host "install: 已安装到 $target"
Write-Host "install: 在 DSH 里新建空白会话，模式选择器里选「$displayName」即可（不需要重启）。"

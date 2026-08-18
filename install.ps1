<#
.SYNOPSIS
  Install the Codex 模式 agent preset into this machine's DSH preset root.

.DESCRIPTION
  The preset root is "$env:DSH_HOME\.agent-presets" and falls back to
  "$HOME\.dsh\.agent-presets", matching how DSH itself resolves its home.
  Nothing is overwritten without -Force, and -Force keeps a timestamped
  backup instead of deleting the previous install.

.PARAMETER Force
  Overwrite an existing preset with the same id (the old directory is backed up first).

.PARAMETER Dest
  Preset root directory. Defaults to $env:DSH_HOME\.agent-presets or $HOME\.dsh\.agent-presets.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Force
#>
[CmdletBinding()]
param(
    [switch]$Force,
    [string]$Dest
)

$ErrorActionPreference = 'Stop'
$presetId = 'codex-mode'

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
    $backup = "$target.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Move-Item -LiteralPath $target -Destination $backup
    Write-Host "install: 旧版本已备份到 $backup"
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $src 'agent.cordis.yml') -Destination (Join-Path $target 'agent.cordis.yml')
$metadata = Join-Path $src 'preset.yml'
if (Test-Path -LiteralPath $metadata -PathType Leaf) {
    Copy-Item -LiteralPath $metadata -Destination (Join-Path $target 'preset.yml')
}

Write-Host "install: 已安装到 $target"
Write-Host "install: 在 DSH 里新建会话，模式选择器里选「Codex 模式」即可（不需要重启）。"

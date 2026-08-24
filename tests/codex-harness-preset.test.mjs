import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const preset = readFileSync(new URL('../presets/codex-harness-mode/agent.cordis.yml', import.meta.url), 'utf8')

test('Harness mode keeps model transport inside DSH', () => {
  assert.match(preset, /name: '@shuind\/dsh-codex-harness'/)
  assert.match(preset, /hostedWebSearch: false/)
  assert.match(preset, /remoteCompact: false/)
  assert.match(preset, /name: '@deepseek-ai\/dsh-compaction-basic'/)
  assert.match(preset, /name: '@deepseek-ai\/dsh-skill-filesystem'/)
  assert.doesNotMatch(preset, /name:\s*['"]?codex(?:\s|$)/m)
  assert.doesNotMatch(preset, /OPENAI_API_KEY|CODEX_API_KEY|modelPolicies:/)
})

test('Harness mode exposes the Codex contract without duplicate native shell or filesystem rows', () => {
  assert.match(preset, /id: codex-harness-tools/)
  assert.doesNotMatch(preset, /name: '@deepseek-ai\/dsh-tool-(?:bash|pwsh|fs)'/)
  assert.match(preset, /name: '@deepseek-ai\/dsh-terminal'/)
  assert.match(preset, /name: '@deepseek-ai\/dsh-tool-ask-user'/)
})

test('installers pin and preflight the Harness adapter', () => {
  const shell = readFileSync(new URL('../install.sh', import.meta.url), 'utf8')
  const powershell = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8')
  for (const installer of [shell, powershell]) {
    assert.match(installer, /codex-harness-mode/)
    assert.match(installer, /@shuind\/dsh-codex-harness@0\.1\.13/)
  }
  assert.ok(shell.indexOf('ensure_harness_dependency') < shell.indexOf('mkdir -p -- "$DEST"'))
})

test('shell installer refuses a half-installed Harness preset when its adapter is absent', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'codex-harness-absent-'))
  try {
    const destination = join(sandbox, 'presets')
    const result = spawnSync('bash', [new URL('../install.sh', import.meta.url).pathname,
      '--preset', 'codex-harness-mode', '--dest', destination], {
      cwd: new URL(root).pathname,
      env: {
        ...process.env,
        DSH_HOME: join(sandbox, 'dsh-home'),
        PATH: '/usr/bin:/bin',
      },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /dsh plugin --profile web add/)
    assert.equal(existsSync(join(destination, 'codex-harness-mode')), false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
test('shell installer copies Harness mode when the adapter resolves from the Web profile', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'codex-harness-present-'))
  try {
    const dshHome = join(sandbox, 'dsh-home')
    const packageDir = join(dshHome, 'profiles', 'web', 'node_modules', '@shuind', 'dsh-codex-harness')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: '@shuind/dsh-codex-harness',
      version: '0.1.13',
    }))
    const destination = join(sandbox, 'presets')
    const result = spawnSync('bash', [new URL('../install.sh', import.meta.url).pathname,
      '--preset', 'codex-harness-mode', '--dest', destination], {
      cwd: new URL(root).pathname,
      env: { ...process.env, DSH_HOME: dshHome },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(existsSync(join(destination, 'codex-harness-mode', 'agent.cordis.yml')), true)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

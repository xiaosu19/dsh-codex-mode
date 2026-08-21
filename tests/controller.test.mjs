import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  apply,
  classifyCall,
  createTurnState,
  hasEmbeddedCd,
  isBroadSearch,
  isReplaceableShellDiscovery,
  observeExecution,
  renderCheckpoint,
  resolveConfig,
  selectCheckpoint,
} from '../presets/codex-mode/controller/runtime-v6.mjs'

const ok = (text = 'ok') => ({
  isError: false,
  content: [{ type: 'text', text }],
})

test('both installers copy the complete preset including hidden entries', () => {
  const shellInstaller = readFileSync(new URL('../install.sh', import.meta.url), 'utf8')
  const powershellInstaller = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8')
  assert.match(shellInstaller, /cp -R -- "\$SRC\/\." "\$DEST\/"/)
  assert.match(powershellInstaller, /Get-ChildItem -LiteralPath \$src -Force/)
  assert.doesNotMatch(powershellInstaller, /Join-Path \$src '\*'/)
})

test('classifies phases independently of provider or model', () => {
  assert.equal(resolveConfig({ mode: 'balanced' }).mode, 'advisory')
  assert.equal(classifyCall('read', { file_path: '/repo/a.js' }), 'discovery')
  assert.equal(classifyCall('edit', { file_path: '/repo/a.js' }), 'mutation')
  assert.equal(classifyCall('bash', { command: 'npm test', workdir: '/repo' }), 'verification')
  assert.equal(classifyCall('bash', { command: 'git status --short', workdir: '/repo' }), 'discovery')
  assert.equal(classifyCall('bash', { command: 'mkdir -p src && cp a src/a' }), 'mutation')
})

test('recognizes only filesystem-root searches as broad by default', () => {
  assert.equal(isBroadSearch('bash', { command: 'find / -maxdepth 4 -name package.json' }), true)
  assert.equal(isBroadSearch('bash', { command: 'find /repo -maxdepth 4 -name package.json' }), false)
  assert.equal(isBroadSearch('glob', { pattern: '**/*.js', path: '/' }), true)
  assert.equal(isBroadSearch('glob', { pattern: '**/*.js', path: '/repo' }), false)
})

test('separates replaceable shell discovery from real shell work', () => {
  assert.equal(
    isReplaceableShellDiscovery('bash', {
      command: 'cd /repo && grep -R "panel" . | head -20',
    }),
    true,
  )
  assert.equal(
    isReplaceableShellDiscovery('bash', {
      command: '/repo/node_modules/.bin/dsh plugin --help | head -60',
    }),
    false,
  )
  assert.equal(
    isReplaceableShellDiscovery('bash', {
      command: 'npm test && git diff --check',
      workdir: '/repo',
    }),
    false,
  )
  assert.equal(hasEmbeddedCd('bash', { command: 'cd /repo && npm test' }), true)
  assert.equal(hasEmbeddedCd('bash', { command: 'npm test', workdir: '/repo' }), false)
  assert.equal(
    isReplaceableShellDiscovery('pwsh', {
      command: 'Get-ChildItem C:\\repo -Recurse | Select-String panel',
    }),
    true,
  )
  assert.equal(
    classifyCall('pwsh', { command: "Set-Content -Path C:\\repo\\a.txt -Value 'a'" }),
    'mutation',
  )
  assert.equal(classifyCall('pwsh', { command: 'Invoke-Pester', workdir: 'C:\\repo' }), 'verification')
  assert.equal(hasEmbeddedCd('pwsh', { command: 'cd C:\\repo; Invoke-Pester' }), true)
})

test('progress ledger moves from orient through implement and verify', () => {
  const config = resolveConfig()
  const state = createTurnState(1)
  observeExecution(
    state,
    { name: 'read', arguments: { file_path: '/repo/a.js' }, step: 1 },
    ok('source'),
    config,
  )
  assert.equal(state.phase, 'orient')
  assert.equal(state.distinctEvidence.size, 1)

  observeExecution(
    state,
    { name: 'edit', arguments: { file_path: '/repo/a.js' }, step: 2 },
    ok('edited'),
    config,
  )
  assert.equal(state.phase, 'implement')
  assert.equal(state.mutationCalls, 1)

  observeExecution(
    state,
    { name: 'bash', arguments: { command: 'npm test', workdir: '/repo' }, step: 3 },
    ok('tests passed'),
    config,
  )
  assert.equal(state.phase, 'verify')
  assert.equal(state.verificationCalls, 1)
})

test('phase checkpoints are one-time advisories without a discovery lease', () => {
  const config = resolveConfig({
    orientDiscoverySteps: 2,
    decisionDiscoverySteps: 3,
    decisionLeaseSteps: 2,
    convergenceStep: 6,
    repeatCheckpointEvery: 2,
  })
  const state = createTurnState(1)
  for (let step = 1; step <= 2; step += 1) {
    observeExecution(
      state,
      { name: 'read', arguments: { file_path: `/repo/${step}.js` }, step },
      ok(`source-${step}`),
      config,
    )
  }
  const orientation = selectCheckpoint(state, 3, config)
  assert.deepEqual(orientation, { rank: 2, reason: 'orientation' })
  assert.match(renderCheckpoint(orientation, state, 3), /next-action:/)
  assert.match(renderCheckpoint(orientation, state, 3), /smallest authorized implementation/)

  observeExecution(
    state,
    { name: 'grep', arguments: { pattern: 'slot', path: '/repo' }, step: 3 },
    ok('match'),
    config,
  )
  assert.deepEqual(selectCheckpoint(state, 4, config), { rank: 3, reason: 'decision' })
  assert.equal(state.phase, 'decide')
  assert.match(renderCheckpoint({ rank: 3, reason: 'decision' }, state, 4, config), /one-time advisory/)
  assert.doesNotMatch(renderCheckpoint({ rank: 3, reason: 'decision' }, state, 4, config), /lease|reject/i)
  assert.equal(selectCheckpoint(state, 5, config), undefined)
  assert.deepEqual(selectCheckpoint(state, 6, config), { rank: 4, reason: 'convergence' })
})

test('runtime integration advises repeated root scans without a pre-execute guard', async () => {
  const listeners = new Map()
  const sections = []
  const ctx = {
    inject(_deps, callback) {
      callback(this)
    },
    on(event, callback) {
      listeners.set(event, callback)
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
      },
    },
  }
  const runtime = apply(ctx, {
    orientDiscoverySteps: 2,
    decisionDiscoverySteps: 3,
    convergenceStep: 6,
    repeatCheckpointEvery: 2,
    maxBroadSearches: 2,
  })
  const agent = {}
  const preStep = listeners.get('agent/pre-step')
  const postTool = listeners.get('tools/post-execute')
  assert.equal(typeof preStep, 'function')
  assert.equal(listeners.has('tools/pre-execute'), false)
  assert.equal(typeof postTool, 'function')
  assert.equal(sections[0].name, 'codex-controller:policy')

  await preStep(
    { agent, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages: [] }),
  )
  let rootNotice
  for (const [step, command] of [
    [1, 'find / -maxdepth 3 -name package.json'],
    [2, 'find / -maxdepth 4 -name package.json'],
  ]) {
    const state = runtime.stateForAgent(agent)
    state.step = step
    rootNotice = await postTool(
      { agent, name: 'bash', arguments: { command } },
      ok(`result-${step}`),
      async () => ({ kind: 'accept' }),
    )
  }
  assert.equal(rootNotice.kind, 'accept')
  assert.match(rootNotice.additionalContexts[0].content[0].text, /No tool is blocked/)

  const decision = await preStep(
    { agent, turn: 1, step: 3, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages: [] }),
  )
  assert.equal(decision.messages.length, 1)
  assert.equal(decision.messages[0].source.plugin, 'codex-controller')
  assert.match(decision.messages[0].content[0].text, /phase: orient/)
})

test('runtime emits each routing advisory once and never denies tools', async () => {
  const listeners = new Map()
  const ctx = {
    inject(_deps, callback) {
      callback(this)
    },
    on(event, callback) {
      const current = listeners.get(event) ?? []
      current.push(callback)
      listeners.set(event, current)
    },
    systemPrompt: { section() {} },
  }
  const runtime = apply(ctx, {
    orientDiscoverySteps: 2,
    decisionDiscoverySteps: 5,
    decisionLeaseSteps: 2,
    convergenceStep: 10,
    shellReminderAfter: 2,
    shellDenyAfter: 3,
    embeddedCdDenyAfter: 2,
  })
  const agent = {}
  const postListeners = listeners.get('tools/post-execute')
  runtime.stateForAgent(agent)

  // pre-step owns turn-state creation in the real loop.
  await listeners.get('agent/pre-step')[0](
    { agent, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages: [] }),
  )

  async function runPost(exec, result = ok()) {
    let index = 0
    const dispatch = () => {
      const listener = postListeners[index++]
      return listener ? listener(exec, result, dispatch) : Promise.resolve({ kind: 'accept' })
    }
    return dispatch()
  }

  const state = runtime.stateForAgent(agent)
  state.step = 1
  await runPost({ agent, name: 'bash', arguments: { command: 'ls -la /repo' } })
  state.step = 2
  const reminder = await runPost({ agent, name: 'bash', arguments: { command: 'find /repo -name "*.js"' } })
  assert.equal(reminder.kind, 'accept')
  assert.match(reminder.additionalContexts[0].content[0].text, /tool-routing advisory/)
  state.step = 3
  const noRepeat = await runPost({ agent, name: 'bash', arguments: { command: 'grep -R panel /repo' } })
  assert.equal(noRepeat.additionalContexts, undefined)
  assert.equal(listeners.has('tools/pre-execute'), false)

  state.step = 3
  await runPost({ agent, name: 'bash', arguments: { command: 'cd /repo && git status' } })
  const cdNotice = await runPost({ agent, name: 'bash', arguments: { command: 'cd /repo && git diff' } })
  assert.match(cdNotice.additionalContexts[0].content[0].text, /workdir argument/)

  for (let step = 4; step <= 7; step += 1) {
    state.step = step
    await runPost({
      agent,
      name: 'read',
      arguments: { file_path: `/repo/evidence-${step}.js` },
    })
  }
  const decision = await listeners.get('agent/pre-step')[0](
    { agent, turn: 1, step: 8, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages: [] }),
  )
  assert.equal(decision.messages.length, 1)
  assert.match(decision.messages[0].content[0].text, /Necessary targeted discovery remains available/)
  const noRepeatedDecision = await listeners.get('agent/pre-step')[0](
    { agent, turn: 1, step: 9, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages: [] }),
  )
  assert.equal(noRepeatedDecision.messages.length, 0)
})

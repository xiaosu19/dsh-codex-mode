import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  apply,
  classifyCall,
  createTurnState,
  observeToolExecution,
  PRESENTATION_GUIDANCE,
  ROUTE_TOOLSETS,
  renderCheckpoint,
  resolveConfig,
  selectPresentationForMessage,
  selectRouteForContext,
  selectRouteForMessage,
  selectCheckpoint,
} from '../presets/codex-ptc-mode/controller/runtime-v14.mjs'

const repository = fileURLToPath(new URL('..', import.meta.url))
const presetRoot = join(repository, 'presets', 'codex-ptc-mode')
const compositionPath = join(presetRoot, 'agent.cordis.yml')
const controllerPath = join(presetRoot, 'controller', 'runtime-v14.mjs')

const ok = (text = 'ok') => ({
  isError: false,
  content: [{ type: 'text', text }],
})

const failed = (text = 'failed') => ({
  isError: true,
  content: [{ type: 'text', text }],
})

function filesUnder(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(relative(root, path))
    }
  }
  visit(root)
  return files.sort()
}

function makeRuntimeHarness(config = {}) {
  const listeners = new Map()
  const sections = []
  const presentationEvents = []
  const restrictionEvents = []
  const ctx = {
    inject(_dependencies, callback) {
      callback(this)
    },
    on(event, callback) {
      const current = listeners.get(event) ?? []
      current.push(callback)
      listeners.set(event, current)
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
      },
    },
    tools: {
      presentAs(mode) {
        presentationEvents.push({ kind: 'set', mode })
        let active = true
        return () => {
          if (!active) return
          active = false
          presentationEvents.push({ kind: 'dispose', mode })
        }
      },
      restrict(filter) {
        restrictionEvents.push({ kind: 'set', filter })
        let active = true
        return () => {
          if (!active) return
          active = false
          restrictionEvents.push({ kind: 'dispose', filter })
        }
      },
    },
  }
  const runtime = apply(ctx, config)
  return { listeners, presentationEvents, restrictionEvents, runtime, sections }
}

async function dispatchWaterfall(listeners, event, args, terminal) {
  const chain = listeners.get(event) ?? []
  let index = 0
  const next = () => {
    const listener = chain[index++]
    return listener ? listener(...args, next) : Promise.resolve(terminal)
  }
  return next()
}

function emitEvent(listeners, event, ...args) {
  for (const listener of listeners.get(event) ?? []) listener(...args)
}

const humanMessage = (text, content = [{ type: 'text', text }]) => ({
  role: 'user',
  content,
  source: { kind: 'user' },
})

test('hybrid preset metadata, adaptive presentation, and compact surface are exact', () => {
  const composition = readFileSync(compositionPath, 'utf8')
  const codexComposition = readFileSync(
    join(repository, 'presets', 'codex-mode', 'agent.cordis.yml'),
    'utf8',
  )
  const metadata = readFileSync(join(presetRoot, 'preset.yml'), 'utf8')

  assert.match(metadata, /^name: Codex PTC 模式$/m)
  assert.match(
    metadata,
    /^description: Codex 工程策略与连续任务能力保持，有界原生搜索\/读取结合任务级精简 Code Mode SDK、批量编排和提前上下文压缩。$/m,
  )
  assert.match(metadata, /^order: 7$/m)
  assert.match(composition, /name: '\.\/controller\/runtime-v14\.mjs'/)
  assert.doesNotMatch(composition, /@deepseek-ai\/dsh-agent-tool-presentation/)

  for (const [key, value] of [
    ['thresholdRatio', '0.72'],
    ['retainRatio', '0.18'],
    ['maxTokens', '8192'],
    ['compactionRetries', '1'],
    ['thresholdChars', '4096'],
    ['headChars', '2560'],
    ['tailChars', '512'],
  ]) {
    assert.match(composition, new RegExp(`^\\s*${key}: ${value}$`, 'm'))
  }

  const millionTokenTargets = [
    ['gpt', 'gpt-5.6-sol'],
    ['gpt', 'gpt-5.6-terra'],
    ['gpt', 'gpt-5.6-luna'],
    ['claude', 'claude-opus-5'],
    ['claude', 'claude-opus-4-8'],
    ['claude', 'claude-opus-4-7'],
    ['claude', 'claude-opus-4-6'],
    ['claude', 'claude-sonnet-5'],
    ['claude', 'claude-sonnet-4-6'],
    ['claude', 'claude-sonnet-4'],
    ['claude', 'claude-sonnet-4-20250514'],
    ['deepseek-official', 'deepseek-v4-pro'],
    ['deepseek-official', 'deepseek-v4-flash'],
    ['deepseek-modlens', 'deepseek-v4-pro'],
    ['deepseek-modlens', 'deepseek-v4-flash'],
  ]
  for (const [provider, model] of millionTokenTargets) {
    assert.match(
      composition,
      new RegExp(
        `provider: ${provider}, model: ${model}, thresholdRatio: 0\\.16, retainTokens: 40000`,
      ),
    )
  }

  const compactionBlock = (source) =>
    source.match(/    - id: automatic-compaction\n[\s\S]*?\n    - id: compact-command/)?.[0]
  assert.equal(compactionBlock(composition), compactionBlock(codexComposition))

  assert.doesNotMatch(composition, /@deepseek-ai\/dsh-tool-goal/)
  assert.doesNotMatch(composition, /@deepseek-ai\/dsh-tool-subagent/)
  assert.doesNotMatch(composition, /@deepseek-ai\/dsh-tool-workflow/)
  assert.doesNotMatch(composition, /@deepseek-ai\/dsh-tool-ralph/)
  assert.doesNotMatch(composition, /^\s*(?:model|reasoningEffort):/m)
})

test('adaptive orchestration favors direct bounded work and reduced code pipelines', () => {
  const composition = readFileSync(compositionPath, 'utf8')
  assert.doesNotMatch(composition, /Adaptive tool orchestration:/)
  assert.doesNotMatch(composition, /Tool discipline:/)
  assert.match(PRESENTATION_GUIDANCE.native, /bounded native direct-tool fast path/)
  assert.doesNotMatch(PRESENTATION_GUIDANCE.native, /run_code/)
  for (const phrase of [
    'Fast path: when the current tool surface exposes native tools for bounded read-only work',
    'Multiple or dependent calls alone do not justify generating a program',
    'conceptual evidence phases, not mandatory model-step boundaries',
    'A successful bounded read or search that contains no requested match is authoritative absence',
  ]) {
    assert.match(composition, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  for (const phrase of [
    'Call only `run_code` directly',
    'Write the shortest clear program sufficient for the stated evidence',
    'one coherent deterministic work unit',
    'run safe independent reads in parallel',
    'put the fixed search directory in `path`',
    'never repeat the directory in both',
    'return compact plain JSON facts',
    'correct only the failed child at most once',
    'Set shell `workdir` explicitly',
    'Never ask the user to switch modes',
    'do not expose the file through `read`',
    'Keep authorized writes minimal and related',
    'A write timeout has unknown outcome',
  ]) {
    assert.match(PRESENTATION_GUIDANCE.code, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(
    composition,
    /An explicit deploy or publish request authorizes that named external write/,
  )
})

test('route selector keeps small direct work native and chooses code for real reduction', () => {
  assert.equal(
    selectPresentationForMessage(
      humanMessage(
        '只读取 /Users/example/repo/package.json，只报告 name 和 scripts.test。禁止修改文件。',
      ),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage('Only read C:\\repo\\package.json and report its name. Do not edit anything.'),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage(
        '先读取 /Users/example/repo/package.json，再 glob 测试目录并读取第一个测试文件。',
      ),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage('读取并修改 /Users/example/repo/package.json 的 version 字段。'),
    ),
    'code',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage('读取并比较 /Users/example/repo/a.json 和 /Users/example/repo/b.json。'),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage(
        '读取 /Users/example/repo/manifest.yml，从其中解析引用的相对路径，再读取该文件并报告配置值。',
      ),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage('读取 /Users/example/repo/image.png', [
        { type: 'text', text: '读取 /Users/example/repo/image.png' },
        { type: 'image', data: 'placeholder' },
      ]),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage('搜索 /Users/example/repo/tests 中包含 compact 的测试并读取最相关文件。'),
    ),
    'native',
  )
  assert.equal(
    selectPresentationForMessage(
      humanMessage('统计整个仓库所有测试文件的断言数量，按目录汇总并排序。'),
    ),
    'code',
  )
  assert.equal(
    selectRouteForMessage(humanMessage('在线搜索官方 API 文档并给出引用。'))?.id,
    'native-research',
  )
  assert.equal(
    selectRouteForMessage(
      humanMessage(
        '/Users/example/account_accessKeys.csv 通过这个账号的 AKSK 看看 Ohio 区域服务器是什么型号。',
      ),
    )?.id,
    'code-core',
  )
  assert.equal(
    selectRouteForMessage(humanMessage('现在测试环境的 SP 数据是怎么获取的？'))?.id,
    'code-core',
  )
  assert.equal(
    selectRouteForMessage(humanMessage('搜索仓库里的测试环境配置文件并解释其数据源。'))?.id,
    'native-search',
  )
  assert.equal(
    selectRouteForMessage(
      humanMessage(
        'An error occurred (ValidationException): Unsupported Dimension Key=LINKED_ACCOUNT',
      ),
    )?.id,
    'code-core',
  )
  assert.equal(
    selectRouteForMessage(
      humanMessage('这个太空了，重新排版并添加账号搜索。', [
        { type: 'text', text: '这个太空了，重新排版并添加账号搜索。' },
        { type: 'image', data: 'placeholder' },
      ]),
    )?.mode,
    'code',
  )
  assert.equal(
    selectRouteForMessage(humanMessage('解释 AWS Cost Explorer 的覆盖率计算口径。'))?.mode,
    'native',
  )
  assert.deepEqual(
    selectRouteForMessage(humanMessage('修复项目并运行测试。'))?.allow,
    ROUTE_TOOLSETS.codeCore,
  )
  assert.equal(
    selectPresentationForMessage({
      role: 'user',
      content: [{ type: 'text', text: 'plugin context' }],
      source: { kind: 'plugin' },
    }),
    undefined,
  )
})

test('context route keeps executable capability for terse workflow follow-ups', () => {
  const previousRoute = selectRouteForMessage(humanMessage('修改功能、运行测试并部署到测试环境。'))
  const previousTurnState = createTurnState(4)
  previousTurnState.phase = 'verify'
  previousTurnState.mutationCalls = 2
  previousTurnState.verificationCalls = 1

  for (const text of ['继续', '开始吧', '就按照你说的做']) {
    const selected = selectRouteForContext(humanMessage(text), {
      previousRoute,
      previousTurnState,
    })
    assert.equal(selected?.mode, 'code', text)
    assert.deepEqual(selected?.allow, ROUTE_TOOLSETS.codeCore, text)
  }

  const imageFollowUp = selectRouteForContext(
    humanMessage('', [{ type: 'image', data: 'placeholder' }]),
    { previousRoute, previousTurnState },
  )
  assert.equal(imageFollowUp?.mode, 'code')
  assert.equal(imageFollowUp?.allow.includes('read_image'), true)

  const explanation = selectRouteForContext(humanMessage('只解释刚才错误的原因，不要修改。'), {
    previousRoute,
    previousTurnState,
  })
  assert.equal(explanation?.mode, 'native')

  const boundedRead = selectRouteForContext(
    humanMessage('只读取 /Users/example/repo/package.json 并报告 name。'),
    { previousRoute, previousTurnState },
  )
  assert.equal(boundedRead?.mode, 'native')
})

test('runtime isolates presentation, restriction, and guidance per agent', () => {
  const { listeners, presentationEvents, restrictionEvents, sections } = makeRuntimeHarness()
  const guidanceByAgent = new Map()
  const makeAgent = (id) => ({
    ctx: {
      tools: {
        presentAs(mode) {
          presentationEvents.push({ kind: 'set', id, mode })
          let active = true
          return () => {
            if (!active) return
            active = false
            presentationEvents.push({ kind: 'dispose', id, mode })
          }
        },
        restrict(filter) {
          restrictionEvents.push({ kind: 'set', id, filter })
          let active = true
          return () => {
            if (!active) return
            active = false
            restrictionEvents.push({ kind: 'dispose', id, filter })
          }
        },
      },
      systemPrompt: {
        section(section) {
          guidanceByAgent.set(id, section.text)
          return () => guidanceByAgent.delete(id)
        },
      },
    },
  })
  const first = makeAgent('first')
  const second = makeAgent('second')
  assert.equal(
    sections.some((section) => section.name === 'codex-ptc-controller:presentation-guidance'),
    false,
  )
  assert.deepEqual(presentationEvents, [])
  assert.deepEqual(restrictionEvents, [])

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent: first,
    message: humanMessage('只读取 /Users/example/repo/package.json 并报告 name。'),
  })
  assert.deepEqual(presentationEvents, [{ kind: 'set', id: 'first', mode: 'native' }])
  assert.deepEqual(restrictionEvents, [
    { kind: 'set', id: 'first', filter: { allow: ['read'] } },
  ])
  assert.equal(guidanceByAgent.get('first'), PRESENTATION_GUIDANCE.native)

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent: second,
    message: humanMessage('修改 /Users/example/repo/package.json 并运行测试。'),
  })
  assert.deepEqual(presentationEvents.slice(-1), [
    { kind: 'set', id: 'second', mode: 'code' },
  ])
  assert.equal(guidanceByAgent.get('second'), PRESENTATION_GUIDANCE.code)
  assert.equal(guidanceByAgent.get('first'), PRESENTATION_GUIDANCE.native)
  assert.deepEqual(restrictionEvents.slice(-1), [
    { kind: 'set', id: 'second', filter: { allow: ROUTE_TOOLSETS.codeCore } },
  ])

  const afterNative = presentationEvents.length
  emitEvent(listeners, 'agent/inbox/inserted', {
    agent: first,
    message: { role: 'user', content: [], source: { kind: 'plugin' } },
  })
  assert.equal(presentationEvents.length, afterNative)

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent: first,
    message: humanMessage('统计整个仓库所有测试文件的断言数量并按目录汇总。'),
  })
  assert.deepEqual(presentationEvents.slice(-2), [
    { kind: 'dispose', id: 'first', mode: 'native' },
    { kind: 'set', id: 'first', mode: 'code' },
  ])
  assert.equal(guidanceByAgent.get('first'), PRESENTATION_GUIDANCE.code)
  assert.equal(guidanceByAgent.get('second'), PRESENTATION_GUIDANCE.code)
  assert.deepEqual(restrictionEvents.slice(-2), [
    { kind: 'dispose', id: 'first', filter: { allow: ROUTE_TOOLSETS.nativeRead } },
    { kind: 'set', id: 'first', filter: { allow: ROUTE_TOOLSETS.codeCore } },
  ])
})

test('runtime keeps Code Mode mounted across an active workflow continuation', async () => {
  const { listeners, presentationEvents, restrictionEvents } = makeRuntimeHarness()
  const agent = {
    ctx: {
      tools: {
        presentAs(mode) {
          presentationEvents.push({ kind: 'set', mode })
          return () => presentationEvents.push({ kind: 'dispose', mode })
        },
        restrict(filter) {
          restrictionEvents.push({ kind: 'set', filter })
          return () => restrictionEvents.push({ kind: 'dispose', filter })
        },
      },
      systemPrompt: {
        section() {
          return () => {}
        },
      },
    },
  }

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent,
    message: humanMessage('修改功能、运行测试并部署到测试环境。'),
  })
  await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 1, signal: new AbortController().signal }],
    { kind: 'enter', messages: [] },
  )
  emitEvent(
    listeners,
    'tools/result',
    { agent, name: 'edit', arguments: { file_path: '/repo/app.ts' }, parent: Symbol('run') },
    ok('updated'),
  )

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent,
    message: humanMessage('继续'),
  })
  assert.deepEqual(presentationEvents, [{ kind: 'set', mode: 'code' }])
  assert.deepEqual(restrictionEvents, [
    { kind: 'set', filter: { allow: ROUTE_TOOLSETS.codeCore } },
  ])

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent,
    message: humanMessage('只解释刚才修改的作用，不要继续修改。'),
  })
  assert.deepEqual(presentationEvents.slice(-2), [
    { kind: 'dispose', mode: 'code' },
    { kind: 'set', mode: 'native' },
  ])
})

test('runtime refreshes a same-presentation route when its capability set changes', () => {
  const { listeners, presentationEvents, restrictionEvents } = makeRuntimeHarness()
  const agent = {
    ctx: {
      tools: {
        presentAs(mode) {
          presentationEvents.push({ kind: 'set', mode })
          return () => presentationEvents.push({ kind: 'dispose', mode })
        },
        restrict(filter) {
          restrictionEvents.push({ kind: 'set', filter })
          return () => restrictionEvents.push({ kind: 'dispose', filter })
        },
      },
      systemPrompt: {
        section() {
          return () => {}
        },
      },
    },
  }

  emitEvent(listeners, 'agent/inbox/inserted', {
    agent,
    message: humanMessage('只读取 /Users/example/repo/package.json 并报告 name。'),
  })
  emitEvent(listeners, 'agent/inbox/inserted', {
    agent,
    message: humanMessage('搜索仓库中包含 compact 的文件并读取最相关结果。'),
  })

  assert.deepEqual(presentationEvents, [
    { kind: 'set', mode: 'native' },
    { kind: 'dispose', mode: 'native' },
    { kind: 'set', mode: 'native' },
  ])
  assert.deepEqual(restrictionEvents, [
    { kind: 'set', filter: { allow: ROUTE_TOOLSETS.nativeRead } },
    { kind: 'dispose', filter: { allow: ROUTE_TOOLSETS.nativeRead } },
    { kind: 'set', filter: { allow: ROUTE_TOOLSETS.nativeSearch } },
  ])
})

test('classifies real Code Mode sub-tools by discovery, mutation, and verification role', () => {
  assert.equal(classifyCall('glob', { pattern: '**/*.ts', path: '/repo' }), 'discovery')
  assert.equal(classifyCall('grep', { pattern: 'run_code', path: '/repo' }), 'discovery')
  assert.equal(classifyCall('read', { file_path: '/repo/a.ts' }), 'discovery')
  assert.equal(classifyCall('edit', { file_path: '/repo/a.ts' }), 'mutation')
  assert.equal(classifyCall('bash', { command: 'npm test', workdir: '/repo' }), 'verification')
  assert.equal(
    classifyCall('bash', {
      command: 'npm test && rm -rf "$tmp"',
      workdir: '/repo',
    }),
    'mutation-verification',
  )
  assert.equal(
    classifyCall('bash', {
      command: 'npm test > report.log',
      workdir: '/repo',
    }),
    'mutation-verification',
  )
  assert.equal(
    classifyCall('bash', { command: 'node --check controller/runtime-v14.mjs', workdir: '/repo' }),
    'verification',
  )
  assert.equal(classifyCall('bash', { command: 'git status --short', workdir: '/repo' }), 'discovery')
})

test('one run_code step records every real child call but ignores the outer transport', () => {
  const state = createTurnState(1)
  const config = resolveConfig()
  const parent = Symbol('outer-run-code-token')
  state.step = 5

  for (const [name, arguments_, result] of [
    ['glob', { pattern: '**/*.mjs', path: '/repo' }, ok('a.mjs\nb.mjs')],
    ['read', { file_path: '/repo/a.mjs', offset: 1, limit: 80 }, ok('source')],
    [
      'edit',
      { file_path: '/repo/a.mjs', old_string: 'before', new_string: 'after' },
      ok('updated'),
    ],
    ['bash', { command: 'npm test', workdir: '/repo' }, failed('1 test failed: expected 2, received 3')],
  ]) {
    const observation = observeToolExecution(
      state,
      { name, arguments: arguments_, parent },
      result,
      config,
    )
    assert.equal(observation.observed, true)
    assert.equal(observation.nested, true)
  }

  assert.equal(state.progressSteps.size, 1)
  assert.deepEqual([...state.progressSteps], [5])
  assert.equal(state.calls, 4)
  assert.equal(state.discoveryCalls, 2)
  assert.equal(state.discoverySteps.size, 1)
  assert.equal(state.mutationCalls, 1)
  assert.equal(state.verificationCalls, 1)
  assert.equal(state.errors, 1)
  assert.equal(state.distinctEvidence.size, 4)
  assert.deepEqual(
    state.evidenceLedger.map(({ name, kind, step }) => ({ name, kind, step })),
    [
      { name: 'glob', kind: 'discovery', step: 5 },
      { name: 'read', kind: 'discovery', step: 5 },
      { name: 'edit', kind: 'mutation', step: 5 },
      { name: 'bash', kind: 'verification', step: 5 },
    ],
  )

  const transport = observeToolExecution(
    state,
    {
      name: 'run_code',
      arguments: { code: 'return true', description: 'bounded phase' },
    },
    failed('program failed after child dispatch'),
    config,
  )
  assert.equal(transport.observed, false)
  assert.equal(transport.transport, true)
  assert.equal(state.transportCalls, 1)
  assert.equal(state.transportErrors, 1)
  assert.equal(state.calls, 4)
  assert.equal(state.errors, 1)
  assert.equal(state.distinctEvidence.size, 4)
  assert.equal(state.evidenceLedger.length, 4)
})

test('orientation, decision, and convergence checkpoints each inject once', () => {
  const config = resolveConfig()
  const state = createTurnState(1)

  for (let step = 1; step <= 4; step += 1) {
    state.step = step
    observeToolExecution(
      state,
      { name: 'read', arguments: { file_path: `/repo/${step}.ts` }, parent: Symbol('run') },
      ok(`source-${step}`),
      config,
    )
  }
  const orientation = selectCheckpoint(state, 4, config)
  assert.deepEqual(orientation, { rank: 2, reason: 'orientation' })
  assert.match(renderCheckpoint(orientation, state, 4), /one-time advisory checkpoint/)
  assert.equal(selectCheckpoint(state, 5, config), undefined)

  for (let step = 5; step <= 7; step += 1) {
    state.step = step
    observeToolExecution(
      state,
      { name: 'grep', arguments: { pattern: `fact-${step}`, path: '/repo' }, parent: Symbol('run') },
      ok(`match-${step}`),
      config,
    )
  }
  assert.deepEqual(selectCheckpoint(state, 7, config), { rank: 3, reason: 'decision' })
  assert.equal(selectCheckpoint(state, 8, config), undefined)
  assert.deepEqual(selectCheckpoint(state, 24, config), { rank: 4, reason: 'convergence' })
  assert.equal(selectCheckpoint(state, 25, config), undefined)
})

test('runtime injects threshold checkpoints on the completing run_code and only once', async () => {
  const { listeners } = makeRuntimeHarness()
  const agent = {}
  const signal = new AbortController().signal
  const parent = Symbol('outer')

  for (let step = 1; step <= 4; step += 1) {
    const preStep = await dispatchWaterfall(
      listeners,
      'agent/pre-step',
      [{ agent, turn: 1, step, signal }],
      { kind: 'enter', messages: [] },
    )
    assert.equal(preStep.messages.length, 0)
    emitEvent(
      listeners,
      'tools/result',
      { agent, name: 'read', arguments: { file_path: `/repo/${step}.ts` }, parent },
      ok(`source-${step}`),
    )
    const transport = {
      agent,
      name: 'run_code',
      arguments: { code: 'return true', description: `discovery-${step}` },
    }
    const outer = await dispatchWaterfall(
      listeners,
      'tools/post-execute',
      [transport, ok('complete')],
      { kind: 'accept' },
    )
    emitEvent(listeners, 'tools/result', transport, ok('complete'))
    if (step < 4) {
      assert.equal(outer.additionalContexts, undefined)
    } else {
      assert.equal(outer.additionalContexts.length, 1)
      assert.match(outer.additionalContexts[0].content[0].text, /reason: orientation/)
      assert.match(outer.additionalContexts[0].content[0].text, /step: 4/)
    }
  }

  const nextStep = await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 5, signal }],
    { kind: 'enter', messages: [] },
  )
  assert.equal(nextStep.messages.length, 0)

  for (let step = 5; step <= 7; step += 1) {
    if (step > 5) {
      const preStep = await dispatchWaterfall(
        listeners,
        'agent/pre-step',
        [{ agent, turn: 1, step, signal }],
        { kind: 'enter', messages: [] },
      )
      assert.equal(preStep.messages.length, 0)
    }
    emitEvent(
      listeners,
      'tools/result',
      { agent, name: 'grep', arguments: { pattern: `fact-${step}`, path: '/repo' }, parent },
      ok(`match-${step}`),
    )
    const transport = {
      agent,
      name: 'run_code',
      arguments: { code: 'return true', description: `discovery-${step}` },
    }
    const outer = await dispatchWaterfall(
      listeners,
      'tools/post-execute',
      [transport, ok('complete')],
      { kind: 'accept' },
    )
    emitEvent(listeners, 'tools/result', transport, ok('complete'))
    if (step < 7) {
      assert.equal(outer.additionalContexts, undefined)
    } else {
      assert.equal(outer.additionalContexts.length, 1)
      assert.match(outer.additionalContexts[0].content[0].text, /reason: decision/)
      assert.match(outer.additionalContexts[0].content[0].text, /step: 7/)
    }
  }

  const afterDecision = await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 8, signal }],
    { kind: 'enter', messages: [] },
  )
  assert.equal(afterDecision.messages.length, 0)
})

test('runtime records authoritative SDK child results and registers no pre-execute rejector', async () => {
  const { listeners, runtime, sections } = makeRuntimeHarness()
  assert.equal(listeners.has('tools/pre-execute'), false)
  assert.equal((listeners.get('tools/post-execute') ?? []).length, 1)
  assert.equal((listeners.get('tools/result') ?? []).length, 1)
  assert.equal(sections[0].name, 'codex-ptc-controller:policy')
  assert.match(sections[0].text, /outer run_code transport is excluded from progress/)

  const agent = {}
  await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 3, signal: new AbortController().signal }],
    { kind: 'enter', messages: [] },
  )
  const parent = Symbol('outer')
  for (const [name, arguments_] of [
    ['grep', { pattern: 'slot', path: '/repo' }],
    ['read', { file_path: '/repo/a.ts' }],
    ['edit', { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' }],
    ['bash', { command: 'npm test', workdir: '/repo' }],
  ]) {
    const exec = { agent, name, arguments: arguments_, parent, token: Symbol(name) }
    const decision = await dispatchWaterfall(
      listeners,
      'tools/post-execute',
      [exec, ok(`raw-${name}`)],
      { kind: 'accept' },
    )
    assert.equal(decision.kind, 'accept')
    emitEvent(listeners, 'tools/result', exec, ok(name))
  }
  const transport = {
    agent,
    name: 'run_code',
    arguments: { code: 'return true', description: 'one phase' },
    token: Symbol('transport'),
  }
  await dispatchWaterfall(
    listeners,
    'tools/post-execute',
    [transport, ok('complete')],
    { kind: 'accept' },
  )
  emitEvent(listeners, 'tools/result', transport, ok('complete'))

  const state = runtime.stateForAgent(agent)
  assert.equal(state.progressSteps.size, 1)
  assert.equal(state.calls, 4)
  assert.equal(state.discoveryCalls, 2)
  assert.equal(state.mutationCalls, 1)
  assert.equal(state.verificationCalls, 1)
  assert.equal(state.transportCalls, 1)
  assert.deepEqual(state.evidenceLedger.map((entry) => entry.name), ['grep', 'read', 'edit', 'bash'])

  const source = readFileSync(controllerPath, 'utf8')
  assert.doesNotMatch(source, /scope\.on\(['"]tools\/pre-execute['"]/)
  assert.doesNotMatch(source, /kind:\s*['"]deny['"]/)
})

test('first failed run_code preserves child evidence and bounded absence without replay', async () => {
  const { listeners } = makeRuntimeHarness()
  const agent = {}
  const signal = new AbortController().signal
  await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 1, signal }],
    { kind: 'enter', messages: [] },
  )
  emitEvent(
    listeners,
    'tools/result',
    { agent, name: 'read', arguments: { file_path: '/repo/test.mjs' }, parent: Symbol('run') },
    ok('100 bounded lines without a test call'),
  )
  const transport = {
    agent,
    name: 'run_code',
    arguments: { code: 'throw new Error("not found")', description: 'bounded extraction' },
  }
  const first = await dispatchWaterfall(
    listeners,
    'tools/post-execute',
    [transport, failed('No test(...) name found in first 100 lines')],
    { kind: 'accept' },
  )
  assert.equal(first.additionalContexts.length, 1)
  assert.match(first.additionalContexts[0].content[0].text, /bounded absence as the result/)
  assert.match(first.additionalContexts[0].content[0].text, /do not replay the full pipeline/)

  await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 2, signal }],
    { kind: 'enter', messages: [] },
  )
  const repeated = await dispatchWaterfall(
    listeners,
    'tools/post-execute',
    [transport, failed('same bounded absence')],
    { kind: 'accept' },
  )
  assert.equal(repeated.additionalContexts, undefined)
})

test('tools/result covers bypassed post-execute failures without double counting normal calls', async () => {
  const { listeners, runtime } = makeRuntimeHarness()
  assert.equal((listeners.get('tools/result') ?? []).length, 1)

  const agent = {}
  await dispatchWaterfall(
    listeners,
    'agent/pre-step',
    [{ agent, turn: 1, step: 2, signal: new AbortController().signal }],
    { kind: 'enter', messages: [] },
  )

  const normal = {
    agent,
    name: 'read',
    arguments: { file_path: '/repo/normal.ts' },
    parent: Symbol('outer'),
    token: Symbol('normal-call'),
  }
  await dispatchWaterfall(
    listeners,
    'tools/post-execute',
    [normal, ok('raw success before downstream policy')],
    { kind: 'block', feedback: [{ type: 'text', text: 'blocked downstream' }] },
  )
  assert.equal(runtime.stateForAgent(agent).calls, 0)
  emitEvent(listeners, 'tools/result', normal, failed('authoritative downstream block'))

  const bypassed = {
    agent,
    name: 'grep',
    arguments: { pattern: 'needle', path: '/repo' },
    parent: Symbol('outer'),
    token: Symbol('bypassed-call'),
  }
  emitEvent(listeners, 'tools/result', bypassed, failed('final-result failure'))

  const transport = {
    agent,
    name: 'run_code',
    arguments: { code: 'return true', description: 'failed transport' },
    token: Symbol('transport-call'),
  }
  emitEvent(listeners, 'tools/result', transport, failed('transport final-result failure'))

  const state = runtime.stateForAgent(agent)
  assert.equal(state.calls, 2)
  assert.equal(state.discoveryCalls, 2)
  assert.equal(state.errors, 2)
  assert.equal(state.transportCalls, 1)
  assert.equal(state.transportErrors, 1)
  assert.deepEqual(state.evidenceLedger.map((entry) => entry.name), ['read', 'grep'])
})

test('installers retain codex-mode default and support all three complete presets', () => {
  const shellInstaller = readFileSync(join(repository, 'install.sh'), 'utf8')
  const powershellInstaller = readFileSync(join(repository, 'install.ps1'), 'utf8')
  assert.match(shellInstaller, /PRESET_ID="codex-mode"/)
  assert.match(shellInstaller, /--preset <codex-mode\|codex-ptc-mode\|codex-harness-mode>/)
  assert.match(shellInstaller, /cp -R -- "\$SRC\/\." "\$DEST\/"/)
  assert.match(powershellInstaller, /\[ValidateSet\('codex-mode', 'codex-ptc-mode', 'codex-harness-mode'\)\]/)
  assert.match(powershellInstaller, /\[string\]\$Preset = 'codex-mode'/)
  assert.match(powershellInstaller, /Get-ChildItem -LiteralPath \$src -Force/)
  assert.match(powershellInstaller, /while \(Test-Path -LiteralPath \$backup\)/)
  assert.match(powershellInstaller, /Move-Item -LiteralPath \$target -Destination \$backup/)

  const temporary = mkdtempSync(join(tmpdir(), 'dsh-codex-ptc-install-'))
  try {
    const fakeBin = join(temporary, 'bin')
    mkdirSync(fakeBin)
    const fakeDate = join(fakeBin, 'date')
    writeFileSync(fakeDate, '#!/bin/sh\nprintf "20000102030405\\n"\n', 'utf8')
    chmodSync(fakeDate, 0o755)
    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` }

    const defaults = join(temporary, 'defaults')
    execFileSync(join(repository, 'install.sh'), ['--dest', defaults], {
      encoding: 'utf8',
      env,
    })
    assert.equal(existsSync(join(defaults, 'codex-mode', 'agent.cordis.yml')), true)
    assert.equal(existsSync(join(defaults, 'codex-ptc-mode')), false)

    const selected = join(temporary, 'selected')
    execFileSync(
      join(repository, 'install.sh'),
      ['--preset', 'codex-ptc-mode', '--dest', selected],
      { encoding: 'utf8', env },
    )
    const installed = join(selected, 'codex-ptc-mode')
    assert.deepEqual(filesUnder(installed), filesUnder(presetRoot))
    for (const file of filesUnder(presetRoot)) {
      assert.deepEqual(readFileSync(join(installed, file)), readFileSync(join(presetRoot, file)))
    }

    writeFileSync(join(installed, 'recover-me.txt'), 'old installation', 'utf8')
    execFileSync(
      join(repository, 'install.sh'),
      ['--preset', 'codex-ptc-mode', '--dest', selected, '--force'],
      { encoding: 'utf8', env },
    )
    const backupBase = join(selected, 'codex-ptc-mode.bak.20000102030405')
    assert.equal(readFileSync(join(backupBase, 'recover-me.txt'), 'utf8'), 'old installation')

    writeFileSync(join(installed, 'recover-me-too.txt'), 'second old installation', 'utf8')
    execFileSync(
      join(repository, 'install.sh'),
      ['--preset', 'codex-ptc-mode', '--dest', selected, '--force'],
      { encoding: 'utf8', env },
    )
    const backups = readdirSync(selected).filter((entry) =>
      entry.startsWith('codex-ptc-mode.bak.'),
    )
    assert.deepEqual(backups.sort(), [
      'codex-ptc-mode.bak.20000102030405',
      'codex-ptc-mode.bak.20000102030405.1',
    ])
    assert.equal(
      readFileSync(join(`${backupBase}.1`, 'recover-me-too.txt'), 'utf8'),
      'second old installation',
    )
    assert.deepEqual(filesUnder(installed), filesUnder(presetRoot))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('pack script requires and archives all complete preset directories', () => {
  const pack = readFileSync(join(repository, 'scripts', 'pack.sh'), 'utf8')
  assert.match(pack, /for preset in codex-mode codex-ptc-mode codex-harness-mode/)
  assert.match(pack, /cp -R -- "\$ROOT\/benchmarks" "\$STAGE\/benchmarks"/)
  assert.match(pack, /\$ROOT\/presets\/\$preset\/controller/)
  assert.match(pack, /cp -R -- "\$ROOT\/presets" "\$STAGE\/presets"/)
  assert.match(pack, /cp -R -- "\$ROOT\/docs" "\$STAGE\/docs"/)
  assert.equal(statSync(controllerPath).isFile(), true)
})

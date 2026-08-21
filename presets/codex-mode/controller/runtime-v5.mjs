// Runtime controller v5 for Codex Mode.
//
// This is intentionally model- and provider-neutral. The persona describes
// policy; this plugin observes the real agent/tool loop and maintains a small
// progress ledger per turn. It injects phase checkpoints only when observed
// behavior drifts, and reserves hard denial for repeated filesystem-root
// searches that have already produced two broad evidence batches.

import { createHash, randomUUID } from 'node:crypto'

export const name = 'codex-controller'
export const inject = []

export const DEFAULT_CONFIG = Object.freeze({
  mode: 'balanced',
  orientDiscoverySteps: 4,
  decisionDiscoverySteps: 7,
  decisionLeaseSteps: 4,
  convergenceStep: 24,
  repeatCheckpointEvery: 4,
  maxBroadSearches: 2,
  shellReminderAfter: 3,
  shellDenyAfter: 4,
  embeddedCdDenyAfter: 2,
  recentTargetLimit: 5,
})

const MUTATION_TOOLS = new Set([
  'edit',
  'write',
  'apply_patch',
  'notebook_edit',
  'create_file',
  'update_file',
  'delete_file',
])

const VERIFICATION_TOOLS = new Set(['job_output', 'wait'])

const DISCOVERY_TOOLS = new Set([
  'read',
  'read_image',
  'modlens_read_image',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
  'skill',
  'shared_doc',
])

const CONTROL_TOOLS = new Set([
  'todo_write',
  'ask_user_question',
  'exit_plan_mode',
  'job_list',
  'job_kill',
])

const SHELL_MUTATION = /(?:^|[\n;&|]\s*)(?:apply_patch|rm|mv|cp|mkdir|touch|chmod|chown|ln|install)\b|\bgit\s+(?:add|commit|push|checkout|switch|merge|rebase|reset)\b|\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall)\b|\bpip(?:3)?\s+install\b|\bgo\s+mod\s+tidy\b|(?:^|[^0-9])(?:>>|>(?!&))\s*\S/i

const POWERSHELL_MUTATION = /(?:^|[;\n|]\s*)(?:Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item|Set-ItemProperty)\b/i

const SHELL_VERIFICATION = /\b(?:npm|pnpm|yarn|bun)\s+(?:(?:run|exec)\s+)?(?:test|build|lint|check|typecheck|verify)\b|\b(?:pytest|jest|vitest|mocha|eslint|tsc|ruff|mypy|cargo\s+test|go\s+test|make\s+(?:test|check)|git\s+diff\s+--check|dotnet\s+test|Invoke-Pester)\b/i

const SHELL_DISCOVERY_VERBS = Object.freeze([
  'pwd',
  'ls',
  'find',
  'grep',
  'rg',
  'cat',
  'sed',
  'head',
  'tail',
  'wc',
  'stat',
])

const REPLACEABLE_SHELL_DISCOVERY = /(?:^|[\s;&|()])(?:pwd|ls|find|grep|rg|cat|sed|head|tail|wc|stat)(?=\s|$)/i
const REPLACEABLE_POWERSHELL_DISCOVERY = /(?:^|[\s;|()])(?:Get-Location|Get-ChildItem|Select-String|Get-Content|Get-Item|pwd|ls|dir|gci|cat|gc|sls)(?=\s|$)/i
const NON_REPLACEABLE_SHELL_WORK = /(?:^|[\s;&|()])(?:git|npm|pnpm|yarn|bun|node|deno|python\d*|ruby|perl|php|java|gradle|mvn|make|cmake|cargo|rustc|go|docker|podman|kubectl|terraform|curl|wget|ssh|scp|rsync|gh|jq|apply_patch|cp|mv|rm|mkdir|touch|chmod|chown|ln|install)(?=\s|$)/i
const RUNTIME_INSPECTION = /(?:node_modules\/\.bin\/|\s--(?:help|version)(?=\s|$))/i

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function positiveInteger(value, key, fallback) {
  const resolved = value === undefined ? fallback : value
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`codex-controller: ${key} must be a positive integer`)
  }
  return resolved
}

export function resolveConfig(input = {}) {
  if (!isRecord(input)) throw new Error('codex-controller: config must be an object')
  const known = new Set(Object.keys(DEFAULT_CONFIG))
  const unknown = Object.keys(input).filter((key) => !known.has(key))
  if (unknown.length > 0) {
    throw new Error(`codex-controller: unknown config key(s): ${unknown.join(', ')}`)
  }
  const mode = input.mode ?? DEFAULT_CONFIG.mode
  if (mode !== 'advisory' && mode !== 'balanced') {
    throw new Error('codex-controller: mode must be "advisory" or "balanced"')
  }
  const config = {
    mode,
    orientDiscoverySteps: positiveInteger(
      input.orientDiscoverySteps,
      'orientDiscoverySteps',
      DEFAULT_CONFIG.orientDiscoverySteps,
    ),
    decisionDiscoverySteps: positiveInteger(
      input.decisionDiscoverySteps,
      'decisionDiscoverySteps',
      DEFAULT_CONFIG.decisionDiscoverySteps,
    ),
    decisionLeaseSteps: positiveInteger(
      input.decisionLeaseSteps,
      'decisionLeaseSteps',
      DEFAULT_CONFIG.decisionLeaseSteps,
    ),
    convergenceStep: positiveInteger(
      input.convergenceStep,
      'convergenceStep',
      DEFAULT_CONFIG.convergenceStep,
    ),
    repeatCheckpointEvery: positiveInteger(
      input.repeatCheckpointEvery,
      'repeatCheckpointEvery',
      DEFAULT_CONFIG.repeatCheckpointEvery,
    ),
    maxBroadSearches: positiveInteger(
      input.maxBroadSearches,
      'maxBroadSearches',
      DEFAULT_CONFIG.maxBroadSearches,
    ),
    shellReminderAfter: positiveInteger(
      input.shellReminderAfter,
      'shellReminderAfter',
      DEFAULT_CONFIG.shellReminderAfter,
    ),
    shellDenyAfter: positiveInteger(
      input.shellDenyAfter,
      'shellDenyAfter',
      DEFAULT_CONFIG.shellDenyAfter,
    ),
    embeddedCdDenyAfter: positiveInteger(
      input.embeddedCdDenyAfter,
      'embeddedCdDenyAfter',
      DEFAULT_CONFIG.embeddedCdDenyAfter,
    ),
    recentTargetLimit: positiveInteger(
      input.recentTargetLimit,
      'recentTargetLimit',
      DEFAULT_CONFIG.recentTargetLimit,
    ),
  }
  if (config.orientDiscoverySteps >= config.decisionDiscoverySteps) {
    throw new Error('codex-controller: orientDiscoverySteps must be below decisionDiscoverySteps')
  }
  if (config.decisionDiscoverySteps >= config.convergenceStep) {
    throw new Error('codex-controller: decisionDiscoverySteps must be below convergenceStep')
  }
  if (config.shellReminderAfter >= config.shellDenyAfter) {
    throw new Error('codex-controller: shellReminderAfter must be below shellDenyAfter')
  }
  return Object.freeze(config)
}

function shellCommand(args) {
  return isRecord(args) && typeof args.command === 'string' ? args.command : ''
}

function shellWorkdir(args) {
  return isRecord(args) && typeof args.workdir === 'string' ? args.workdir : ''
}

function shellVerbs(command) {
  const lower = command.toLowerCase()
  return SHELL_DISCOVERY_VERBS.filter((verb) => new RegExp(`\\b${verb}\\b`).test(lower))
}

export function hasEmbeddedCd(name, args) {
  if (name !== 'bash' && name !== 'pwsh') return false
  const command = shellCommand(args)
  return name === 'bash'
    ? /(?:^|[;&|]\s*)cd\s+/m.test(command)
    : /(?:^|[;|]\s*)(?:Set-Location|cd)\s+/im.test(command)
}

export function isReplaceableShellDiscovery(name, args) {
  if (name !== 'bash' && name !== 'pwsh') return false
  const command = shellCommand(args)
  if (command === '' || classifyCall(name, args) !== 'discovery') return false
  const discoveryPattern =
    name === 'pwsh' ? REPLACEABLE_POWERSHELL_DISCOVERY : REPLACEABLE_SHELL_DISCOVERY
  return (
    discoveryPattern.test(command) &&
    !NON_REPLACEABLE_SHELL_WORK.test(command) &&
    !RUNTIME_INSPECTION.test(command)
  )
}

export function isBroadSearch(name, args) {
  if (name === 'glob' || name === 'grep') {
    return isRecord(args) && args.path === '/'
  }
  if (name !== 'bash' && name !== 'pwsh') return false
  const command = shellCommand(args)
  if (name === 'bash') {
    return /(?:^|[;&|]\s*)find\s+\/(?:\s|$)/m.test(command)
  }
  return /(?:^|[;|]\s*)Get-ChildItem\s+(?:-Path\s+)?[A-Za-z]:\\(?:\s|$)/im.test(command)
}

export function classifyCall(name, args) {
  if (MUTATION_TOOLS.has(name)) return 'mutation'
  if (VERIFICATION_TOOLS.has(name)) return 'verification'
  if (CONTROL_TOOLS.has(name)) return 'control'
  if (name === 'bash' || name === 'pwsh') {
    const command = shellCommand(args)
    if (SHELL_MUTATION.test(command) || (name === 'pwsh' && POWERSHELL_MUTATION.test(command))) {
      return 'mutation'
    }
    if (SHELL_VERIFICATION.test(command)) return 'verification'
    return 'discovery'
  }
  if (DISCOVERY_TOOLS.has(name)) {
    if (name === 'shared_doc' && isRecord(args)) {
      return args.action === 'write' || args.action === 'append' ? 'mutation' : 'discovery'
    }
    return 'discovery'
  }
  return 'other'
}

function normalizePath(value) {
  return value.replace(/[),:;]+$/g, '').replace(/\/{2,}/g, '/').slice(0, 240)
}

function absolutePaths(command) {
  const paths = []
  const matcher = /(?:^|[\s"'=])((?:\/[A-Za-z0-9._@+~-]+)+(?:\/[A-Za-z0-9._@+~-]+)*)/g
  let match
  while ((match = matcher.exec(command)) !== null && paths.length < 3) {
    const path = normalizePath(match[1])
    if (!paths.includes(path)) paths.push(path)
  }
  return paths
}

export function callTarget(name, args) {
  if (!isRecord(args)) return name
  for (const key of ['file_path', 'path', 'workdir', 'url', 'name']) {
    if (typeof args[key] === 'string' && args[key].trim() !== '') {
      return normalizePath(args[key].trim())
    }
  }
  if (name === 'bash' || name === 'pwsh') {
    const paths = absolutePaths(shellCommand(args))
    if (paths.length > 0) return paths.join(' | ')
  }
  if (typeof args.pattern === 'string') return `pattern:${args.pattern.slice(0, 160)}`
  if (typeof args.query === 'string') return `query:${args.query.slice(0, 160)}`
  return name
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex').slice(0, 16)
}

function callFingerprint(name, args, kind) {
  if (name === 'bash' || name === 'pwsh') {
    const verbs = shellVerbs(shellCommand(args)).join(',') || 'command'
    return `${kind}:${name}:${verbs}:${callTarget(name, args)}:${shellWorkdir(args)}`
  }
  return `${kind}:${name}:${callTarget(name, args)}`
}

function rememberTarget(state, target, limit) {
  if (target === '' || target === state.recentTargets.at(-1)) return
  state.recentTargets.push(target)
  if (state.recentTargets.length > limit) state.recentTargets.shift()
}

export function createTurnState(turn = 1) {
  return {
    turn,
    step: 0,
    phase: 'orient',
    calls: 0,
    discoveryCalls: 0,
    discoverySteps: new Set(),
    mutationCalls: 0,
    verificationCalls: 0,
    controlCalls: 0,
    errors: 0,
    broadSearches: 0,
    embeddedCdCalls: 0,
    shellDiscoveryCalls: 0,
    replaceableShellDiscoveryCalls: 0,
    discoverySinceProgress: 0,
    semanticRepeatStreak: 0,
    distinctEvidence: new Set(),
    callFingerprints: new Map(),
    resultFingerprints: new Map(),
    recentTargets: [],
    checkpointRank: 0,
    lastCheckpointStep: 0,
  }
}

export function observeExecution(state, execution, result, config = DEFAULT_CONFIG) {
  const args = isRecord(execution.arguments) ? execution.arguments : {}
  const kind = classifyCall(execution.name, args)
  const target = callTarget(execution.name, args)
  const fingerprint = callFingerprint(execution.name, args, kind)
  const resultFingerprint = hash({ isError: result.isError, content: result.content ?? [] })
  const callSeen = state.callFingerprints.get(fingerprint) ?? 0
  const resultSeen = state.resultFingerprints.get(resultFingerprint) ?? 0
  const replaceableShellDiscovery = isReplaceableShellDiscovery(execution.name, args)

  state.calls += 1
  state.step = Math.max(state.step, execution.step ?? state.step)
  state.callFingerprints.set(fingerprint, callSeen + 1)
  state.resultFingerprints.set(resultFingerprint, resultSeen + 1)
  rememberTarget(state, target, config.recentTargetLimit)

  if (result.isError) {
    state.errors += 1
    state.semanticRepeatStreak += 1
  }

  if (isBroadSearch(execution.name, args)) state.broadSearches += 1

  if (execution.name === 'bash' || execution.name === 'pwsh') {
    if (hasEmbeddedCd(execution.name, args)) state.embeddedCdCalls += 1
    if (kind === 'discovery') state.shellDiscoveryCalls += 1
    if (replaceableShellDiscovery) {
      state.replaceableShellDiscoveryCalls += 1
    }
  }

  switch (kind) {
    case 'mutation':
      state.mutationCalls += 1
      state.phase = result.isError ? 'recover' : 'implement'
      if (!result.isError) {
        state.discoverySinceProgress = 0
        state.semanticRepeatStreak = 0
      }
      break
    case 'verification':
      state.verificationCalls += 1
      state.phase = result.isError ? 'recover' : state.mutationCalls > 0 ? 'verify' : 'orient'
      if (!result.isError) {
        state.discoverySinceProgress = 0
        state.semanticRepeatStreak = 0
      }
      break
    case 'discovery': {
      state.discoveryCalls += 1
      state.discoverySteps.add(state.step)
      state.discoverySinceProgress += 1
      const evidenceKey = `${fingerprint}:${resultFingerprint}`
      if (!result.isError && !state.distinctEvidence.has(evidenceKey)) {
        state.distinctEvidence.add(evidenceKey)
        state.semanticRepeatStreak = 0
      } else if (!result.isError) {
        state.semanticRepeatStreak += 1
      }
      break
    }
    case 'control':
      state.controlCalls += 1
      break
    default:
      break
  }

  return { kind, target, callSeen, resultSeen, replaceableShellDiscovery }
}

function checkpointCandidate(state, step, config) {
  const discoverySteps = state.discoverySteps.size
  if (step >= config.convergenceStep) {
    return { rank: 4, reason: 'convergence' }
  }
  if (state.mutationCalls === 0 && discoverySteps >= config.decisionDiscoverySteps) {
    return { rank: 3, reason: 'decision' }
  }
  if (
    state.semanticRepeatStreak >= 3 ||
    (state.mutationCalls > 0 && state.discoverySinceProgress >= config.orientDiscoverySteps)
  ) {
    return { rank: 3, reason: 'stall' }
  }
  if (
    state.mutationCalls === 0 &&
    (discoverySteps >= config.orientDiscoverySteps || state.embeddedCdCalls >= 3)
  ) {
    return { rank: 2, reason: 'orientation' }
  }
  if (state.broadSearches > 0) return { rank: 1, reason: 'scope' }
  return undefined
}

export function selectCheckpoint(state, step, config = DEFAULT_CONFIG) {
  const candidate = checkpointCandidate(state, step, config)
  if (candidate === undefined) return undefined
  const newRank = candidate.rank > state.checkpointRank
  const repeatDue =
    candidate.rank >= 3 && step - state.lastCheckpointStep >= config.repeatCheckpointEvery
  if (!newRank && !repeatDue) return undefined
  state.checkpointRank = Math.max(state.checkpointRank, candidate.rank)
  state.lastCheckpointStep = step
  if (candidate.reason === 'decision' && state.mutationCalls === 0) state.phase = 'decide'
  if (candidate.reason === 'stall') state.phase = 'recover'
  if (candidate.reason === 'convergence') state.phase = 'converge'
  return candidate
}

function phaseAction(checkpoint, state) {
  switch (checkpoint.reason) {
    case 'scope':
      return 'A broad filesystem search has already run. Keep subsequent discovery inside the task workspace or one explicitly justified dependency root.'
    case 'orientation':
      return 'Choose the single unresolved fact that controls the deliverable. Use at most one targeted evidence batch for it; otherwise produce the supported conclusion or begin the smallest authorized implementation.'
    case 'decision':
      return 'Several discovery steps have completed without a deliverable. Do not open another architecture branch by default: synthesize the supported answer, make the smallest authorized change, or report one concrete blocker and the exact missing fact.'
    case 'stall':
      return 'Recent calls are not advancing the deliverable or verification. Reuse the evidence ledger, change phase, and produce a conclusion or take one authorized state-changing action; if neither is safe, stop with one concrete blocker.'
    default:
      return state.mutationCalls > 0
        ? 'Finish the current implementation and run only verification that covers a distinct risk. Start new discovery only when a failed check identifies a new cause.'
        : 'The turn has reached its convergence boundary without an observed implementation. Produce the evidence-backed answer, make the supported minimum change only when authorized, or report one concrete blocker; do not continue open-ended discovery.'
  }
}

export function renderCheckpoint(checkpoint, state, step, config = DEFAULT_CONFIG) {
  const targets = state.recentTargets.length > 0 ? state.recentTargets.join(' | ') : '(none)'
  const decisionLimit = config.decisionDiscoverySteps + config.decisionLeaseSteps
  const lease =
    state.mutationCalls === 0 && checkpoint.rank >= 3
      ? `\ndiscovery lease: ${Math.max(0, decisionLimit - state.discoverySteps.size)} model step(s) remain before new discovery pauses`
      : ''
  return [
    '[Codex controller checkpoint]',
    `reason: ${checkpoint.reason}`,
    `phase: ${state.phase}`,
    `step: ${step}`,
    `observed: ${state.discoverySteps.size} discovery step(s), ${state.mutationCalls} mutation call(s), ${state.verificationCalls} verification call(s), ${state.errors} error(s)`,
    `evidence: ${state.distinctEvidence.size} distinct result(s); recent targets: ${targets}${lease}`,
    `next-action contract: ${phaseAction(checkpoint, state)}`,
    'This checkpoint is based on executed tools and results. It does not request hidden chain-of-thought; respond with the next useful action or a concise user-facing blocker.',
  ].join('\n')
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

function pluginMessage(text, summary) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: name,
      form: 'notice',
      summary,
    },
  })
}

function checkpointMessage(text, checkpoint) {
  return pluginMessage(text, `controller: ${checkpoint.reason}`)
}

function prependContext(ours, theirs) {
  return [ours, ...(theirs ?? [])]
}

function shellDiscoveryReminder(state) {
  return pluginMessage(
    [
      '[Codex controller tool-routing reminder]',
      `${state.replaceableShellDiscoveryCalls} shell call(s) this turn performed file/path discovery that structured tools can cover.`,
      'Use glob for paths, grep for content, and read for context; independent calls may be batched in one response.',
      'Keep Bash for Git, builds, tests, scripts, and runtime inspection. Reuse current evidence or produce the deliverable instead of opening another shell-search branch.',
    ].join('\n'),
    'controller: prefer structured discovery',
  )
}

export function apply(ctx, inputConfig = {}) {
  const config = resolveConfig(inputConfig)
  const states = new WeakMap()

  const stateFor = (agent, turn) => {
    const current = states.get(agent)
    if (current !== undefined && current.turn === turn) return current
    const created = createTurnState(turn)
    states.set(agent, created)
    return created
  }

  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'codex-controller:policy',
      order: 49,
      text: [
        'A runtime controller observes executed tools and results for this turn.',
        'It tracks orient, implement, recover, and verify phases plus a compact evidence ledger.',
        'When progress drifts it injects a [Codex controller checkpoint] as plugin context.',
        'Treat that checkpoint as current operational state: choose the requested next action without exposing hidden chain-of-thought.',
        'After a decision checkpoint, discovery has a short bounded lease for the last controlling fact; when that lease is exhausted, use current evidence to deliver, edit, ask one concrete question, or report a blocker.',
        'The controller is phase-aware; its step numbers are convergence signals, not permission to skip necessary implementation or distinct verification.',
      ].join(' '),
    })
  })

  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const state = stateFor(agent, turn)
    state.step = step
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const checkpoint = selectCheckpoint(state, step, config)
    if (checkpoint === undefined) return decision
    const text = renderCheckpoint(checkpoint, state, step, config)
    return {
      kind: 'enter',
      messages: [...decision.messages, checkpointMessage(text, checkpoint)],
    }
  })

  ctx.inject(['tools'], (scope) => {
    scope.on('tools/pre-execute', (exec, next) => {
      if (config.mode !== 'balanced' || exec.agent === undefined) return next()
      const state = states.get(exec.agent)
      if (state === undefined) return next()

      const kind = classifyCall(exec.name, exec.arguments)
      const decisionLimit = config.decisionDiscoverySteps + config.decisionLeaseSteps
      if (
        kind === 'discovery' &&
        state.mutationCalls === 0 &&
        state.discoverySteps.size >= decisionLimit
      ) {
        return Promise.resolve({
          kind: 'deny',
          reason:
            `codex-controller: the decision lease ended after ${state.discoverySteps.size} discovery model step(s) without an observed deliverable. ` +
            'Do not retry through another discovery tool. Use the existing evidence to produce the evidence-backed answer, make the smallest authorized edit, ask one concrete question, or report one blocker. Mutation and subsequent verification remain available.',
        })
      }

      if (
        isBroadSearch(exec.name, exec.arguments) &&
        state.mutationCalls === 0 &&
        state.broadSearches >= config.maxBroadSearches
      ) {
        return Promise.resolve({
          kind: 'deny',
          reason:
            `codex-controller: ${state.broadSearches} filesystem-root search(es) already ran in this turn without implementation. ` +
            'Use the existing evidence, a workspace-scoped glob/grep/read call, or report the exact blocker instead of scanning the root again.',
        })
      }

      if (
        hasEmbeddedCd(exec.name, exec.arguments) &&
        state.embeddedCdCalls >= config.embeddedCdDenyAfter
      ) {
        return Promise.resolve({
          kind: 'deny',
          reason:
            `codex-controller: ${state.embeddedCdCalls} Bash/PowerShell call(s) already embedded a directory change in this turn. ` +
            'Retry the useful command with the tool workdir argument; do not carry cwd through command text.',
        })
      }

      if (
        isReplaceableShellDiscovery(exec.name, exec.arguments) &&
        state.discoverySteps.size >= config.orientDiscoverySteps &&
        state.replaceableShellDiscoveryCalls >= config.shellDenyAfter
      ) {
        return Promise.resolve({
          kind: 'deny',
          reason:
            `codex-controller: ${state.replaceableShellDiscoveryCalls} replaceable shell-discovery call(s) already ran in this turn. ` +
            'Use glob for paths, grep for content, read for context, reuse the evidence ledger, or produce the deliverable. Git/build/test/runtime Bash remains available.',
        })
      }

      return next()
    })

    scope.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()
      if (exec.agent === undefined) return decision
      const state = states.get(exec.agent)
      if (state === undefined) return decision
      const observation = observeExecution(
        state,
        { name: exec.name, arguments: exec.arguments, step: state.step },
        result,
        config,
      )
      if (
        observation.replaceableShellDiscovery &&
        state.replaceableShellDiscoveryCalls === config.shellReminderAfter
      ) {
        const reminder = shellDiscoveryReminder(state)
        if (decision.kind === 'block') {
          return {
            kind: 'block',
            feedback: decision.feedback,
            additionalContexts: prependContext(reminder, decision.additionalContexts),
          }
        }
        return {
          ...decision,
          additionalContexts: prependContext(reminder, decision.additionalContexts),
        }
      }
      return decision
    })
  })

  // Optional diagnostics for tests and host-side inspection. It is deliberately
  // not a model-facing tool and the WeakMap keeps agent lifetime authoritative.
  return {
    stateForAgent(agent) {
      return states.get(agent)
    },
    config,
  }
}

export default { name, inject, apply }

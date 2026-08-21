// Runtime controller v6 for Codex Mode.
//
// DSH exposes a tool guard as allow/deny, and a denial is persisted and shown
// as a red tool error. That makes a global step budget the wrong enforcement
// mechanism: the model can retry a denied read through another discovery tool,
// turning a convergence hint into a noisy failure loop. V6 is deliberately
// advisory. It observes real progress, emits each phase checkpoint once, and
// never rejects a tool call.

import { randomUUID } from 'node:crypto'

import {
  DEFAULT_CONFIG as BASE_DEFAULT_CONFIG,
  callTarget,
  classifyCall,
  createTurnState as createBaseTurnState,
  hasEmbeddedCd,
  isBroadSearch,
  isReplaceableShellDiscovery,
  observeExecution,
  resolveConfig as resolveBaseConfig,
} from './runtime-v5.mjs'

export {
  callTarget,
  classifyCall,
  hasEmbeddedCd,
  isBroadSearch,
  isReplaceableShellDiscovery,
  observeExecution,
} from './runtime-v5.mjs'

export const name = 'codex-controller'
export const inject = []

export const DEFAULT_CONFIG = Object.freeze({
  ...BASE_DEFAULT_CONFIG,
  mode: 'advisory',
})

export function resolveConfig(input = {}) {
  return resolveBaseConfig({ ...input, mode: 'advisory' })
}

export function createTurnState(turn = 1) {
  const state = createBaseTurnState(turn)
  state.advisoryKeys = new Set()
  return state
}

function advisoryKeys(state) {
  if (!(state.advisoryKeys instanceof Set)) state.advisoryKeys = new Set()
  return state.advisoryKeys
}

function checkpointCandidate(state, step, config) {
  if (step >= config.convergenceStep) {
    return { rank: 4, reason: 'convergence', key: 'checkpoint:convergence' }
  }
  if (
    state.semanticRepeatStreak >= 3 ||
    (state.mutationCalls > 0 && state.discoverySinceProgress >= config.orientDiscoverySteps)
  ) {
    return {
      rank: 3,
      reason: 'stall',
      key: `checkpoint:stall:${state.mutationCalls}:${state.verificationCalls}`,
    }
  }
  if (state.mutationCalls === 0 && state.discoverySteps.size >= config.decisionDiscoverySteps) {
    return { rank: 3, reason: 'decision', key: 'checkpoint:decision' }
  }
  if (
    state.mutationCalls === 0 &&
    (state.discoverySteps.size >= config.orientDiscoverySteps || state.embeddedCdCalls >= 3)
  ) {
    return { rank: 2, reason: 'orientation', key: 'checkpoint:orientation' }
  }
  if (state.broadSearches > 0) {
    return { rank: 1, reason: 'scope', key: 'checkpoint:scope' }
  }
  return undefined
}

export function selectCheckpoint(state, step, config = DEFAULT_CONFIG) {
  const candidate = checkpointCandidate(state, step, config)
  if (candidate === undefined) return undefined
  const keys = advisoryKeys(state)
  if (keys.has(candidate.key)) return undefined
  keys.add(candidate.key)
  state.checkpointRank = Math.max(state.checkpointRank, candidate.rank)
  state.lastCheckpointStep = step
  if (candidate.reason === 'decision') state.phase = 'decide'
  if (candidate.reason === 'stall') state.phase = 'recover'
  if (candidate.reason === 'convergence') state.phase = 'converge'
  return { rank: candidate.rank, reason: candidate.reason }
}

function phaseAction(checkpoint, state) {
  switch (checkpoint.reason) {
    case 'scope':
      return 'Keep later discovery inside the task workspace or one explicitly justified dependency root.'
    case 'orientation':
      return 'Name the one unresolved fact that controls the deliverable, then use one targeted evidence batch or begin the smallest authorized implementation.'
    case 'decision':
      return 'Synthesize the evidence and choose implementation, an evidence-backed answer, one concrete question, or one blocker. Necessary targeted discovery remains available.'
    case 'stall':
      return 'Reuse the evidence ledger and change strategy. Take one useful implementation or verification action, or finish with one concrete blocker.'
    default:
      return state.mutationCalls > 0
        ? 'Finish the current implementation and run only verification that covers a distinct risk.'
        : 'Converge on the supported answer, minimum authorized change, one concrete question, or one blocker.'
  }
}

export function renderCheckpoint(checkpoint, state, step) {
  const targets = state.recentTargets.length > 0 ? state.recentTargets.join(' | ') : '(none)'
  return [
    '[Codex controller checkpoint]',
    `reason: ${checkpoint.reason}`,
    `phase: ${state.phase}`,
    `step: ${step}`,
    `observed: ${state.discoverySteps.size} discovery step(s), ${state.mutationCalls} mutation call(s), ${state.verificationCalls} verification call(s), ${state.errors} tool error(s)`,
    `evidence: ${state.distinctEvidence.size} distinct result(s); recent targets: ${targets}`,
    `next-action: ${phaseAction(checkpoint, state)}`,
    'This is a one-time advisory checkpoint. It never turns a tool call into an error and does not request hidden chain-of-thought.',
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

function toolRoutingNotices(state, observation, config) {
  const notices = []
  const keys = advisoryKeys(state)
  const add = (key, text, summary) => {
    if (keys.has(key)) return
    keys.add(key)
    notices.push(pluginMessage(text, summary))
  }

  if (
    observation.replaceableShellDiscovery &&
    state.replaceableShellDiscoveryCalls >= config.shellReminderAfter
  ) {
    add(
      'routing:structured-discovery',
      [
        '[Codex controller tool-routing advisory]',
        `${state.replaceableShellDiscoveryCalls} shell call(s) performed file/path discovery that structured tools can cover.`,
        'Prefer glob for paths, grep for content, and read for context. Keep Bash/PowerShell for Git, builds, tests, scripts, and runtime inspection.',
        'No tool is blocked; use the route that reaches the deliverable with the least repeated evidence.',
      ].join('\n'),
      'controller: prefer structured discovery',
    )
  }

  if (isBroadSearch(observation.name, observation.arguments) && state.broadSearches >= config.maxBroadSearches) {
    add(
      'routing:root-scope',
      [
        '[Codex controller scope advisory]',
        `${state.broadSearches} filesystem-root search(es) have completed in this turn.`,
        'Keep subsequent discovery inside the task workspace or one explicitly justified dependency root. No tool is blocked.',
      ].join('\n'),
      'controller: keep search scoped',
    )
  }

  if (hasEmbeddedCd(observation.name, observation.arguments) && state.embeddedCdCalls >= config.embeddedCdDenyAfter) {
    add(
      'routing:workdir',
      [
        '[Codex controller workdir advisory]',
        `${state.embeddedCdCalls} shell call(s) embedded a directory change.`,
        'Use the Bash/PowerShell workdir argument on later calls so each command has an explicit repository root. No tool is blocked.',
      ].join('\n'),
      'controller: use structured workdir',
    )
  }

  return notices
}

function prependContexts(notices, decision) {
  if (notices.length === 0) return decision
  if (decision.kind === 'block') {
    return {
      kind: 'block',
      feedback: decision.feedback,
      additionalContexts: [...notices, ...(decision.additionalContexts ?? [])],
    }
  }
  return {
    ...decision,
    additionalContexts: [...notices, ...(decision.additionalContexts ?? [])],
  }
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
        'A non-blocking runtime controller observes executed tools and results for this turn.',
        'It tracks orient, decide, implement, recover, and verify phases plus a compact evidence ledger.',
        'When progress drifts it may inject a one-time [Codex controller checkpoint] as plugin context.',
        'The checkpoint is advisory: it never rejects a tool and never asks for hidden chain-of-thought.',
        'Use it to choose the shortest evidence-backed next action; take another targeted discovery step when it is genuinely required for correctness.',
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
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        pluginMessage(renderCheckpoint(checkpoint, state, step), `controller: ${checkpoint.reason}`),
      ],
    }
  })

  ctx.inject(['tools'], (scope) => {
    // There is intentionally no tools/pre-execute hook. In DSH, a guard denial
    // is a real tool error, so convergence guidance belongs after observation
    // and before the next model step rather than in the execution path.
    scope.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()
      if (exec.agent === undefined) return decision
      const state = states.get(exec.agent)
      if (state === undefined) return decision
      const observation = {
        ...observeExecution(
          state,
          { name: exec.name, arguments: exec.arguments, step: state.step },
          result,
          config,
        ),
        name: exec.name,
        arguments: exec.arguments,
      }
      return prependContexts(toolRoutingNotices(state, observation, config), decision)
    })
  })

  return {
    stateForAgent(agent) {
      return states.get(agent)
    },
    config,
  }
}

export default { name, inject, apply }

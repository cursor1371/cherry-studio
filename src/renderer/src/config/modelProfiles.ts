import store from '@renderer/store'
import type { Model, Provider, ReasoningEffortOption } from '@renderer/types'
import { type ModelProfile, modelProfileSchema, type ProfileProtocol } from '@renderer/types/modelProfile'

export function supportsModelProfiles(provider: Provider): boolean {
  return provider.authType !== 'oauth' &&
    !['copilot', 'github', 'cherryai', 'gateway', 'openrouter', 'tokenflux'].includes(provider.id) &&
    ['openai', 'openai-response', 'anthropic', 'gemini', 'new-api'].includes(provider.type)
}

// Read the current provider, not the model snapshot stored in an assistant.
export function getModelProfile(model?: Model | null, provider?: Provider): ModelProfile | undefined {
  if (!model) return undefined
  const current = provider ?? store.getState().llm.providers.find((entry) => entry.id === model.provider)
  if (!current || !supportsModelProfiles(current)) return undefined
  const profiles = current.modelProfiles
  return profiles && Object.hasOwn(profiles, model.id) ? profiles[model.id] : undefined
}

export function getProfileEffort(profile: ModelProfile, effort?: ReasoningEffortOption): ReasoningEffortOption {
  return profile.reasoning.find((choice) => choice.id === effort)?.id ?? 'default'
}

export function getProfileEffortOptions(profile: ModelProfile): ReasoningEffortOption[] {
  return ['default', ...profile.reasoning.map((choice) => choice.id)]
}

export const profileProviderIds = {
  openai: 'profile-openai-chat',
  'openai-response': 'profile-openai',
  anthropic: 'profile-anthropic',
  gemini: 'profile-google'
} as const

export const profileNamespaces = {
  openai: 'openai',
  'openai-response': 'openai',
  anthropic: 'anthropic',
  gemini: 'google'
} as const

export function createModelProfile(protocol: ProfileProtocol, budget = false, full = false): ModelProfile {
  const reasoning: ModelProfile['reasoning'] = []
  for (const [id, tokens] of [['low', 2048], ['medium', 4096], ['high', 8192]] as const) {
    // Build JSON values directly: inferring heterogeneous callback returns creates
    // optional undefined properties, which are not valid JSON parameter values.
    const parameters: ModelProfile['reasoning'][number]['parameters'] = {}
    switch (protocol) {
      case 'gemini':
        if (budget) {
          parameters.thinkingConfig = { includeThoughts: true, thinkingBudget: tokens }
        } else {
          parameters.thinkingConfig = { includeThoughts: true, thinkingLevel: id }
        }
        break
      case 'anthropic':
        if (budget) {
          parameters.thinking = { type: 'enabled', budgetTokens: tokens }
        } else {
          parameters.thinking = { type: 'adaptive', display: 'summarized' }
          parameters.effort = id
        }
        break
      default:
        parameters.reasoningEffort = id
    }
    reasoning.push({ id, parameters })
  }
  if (full) {
    if (protocol.startsWith('openai')) {
      reasoning.unshift(
        { id: 'none', parameters: { reasoningEffort: 'none' } },
        { id: 'minimal', parameters: { reasoningEffort: 'minimal' } }
      )
      reasoning.push(
        { id: 'xhigh', parameters: { reasoningEffort: 'xhigh' } },
        { id: 'auto', label: 'max', parameters: { reasoningEffort: 'max' } }
      )
    } else if (protocol === 'anthropic') {
      reasoning.unshift({ id: 'none', label: 'disabled', parameters: { thinking: { type: 'disabled' } } })
      if (!budget) {
        reasoning.splice(1, 0, { id: 'minimal', label: 'between_tools', parameters: { thinking: { type: 'between_tools' }, effort: 'low' } })
        for (const [id, effort] of [['xhigh', 'xhigh'], ['auto', 'max']] as const) {
          reasoning.push({ id, label: effort, parameters: { thinking: { type: 'adaptive', display: 'summarized' }, effort } })
        }
      }
    } else if (budget) {
      reasoning.unshift({ id: 'none', label: 'budget: 0', parameters: { thinkingConfig: { thinkingBudget: 0 } } })
      reasoning.push({ id: 'auto', label: 'budget: -1', parameters: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } } })
    } else {
      reasoning.unshift({ id: 'minimal', parameters: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'minimal' } } })
    }
  }
  const profile = modelProfileSchema.parse({
    version: 1,
    protocol,
    options: protocol.startsWith('openai') ? { forceReasoning: true, store: false } : {},
    reasoning,
    ...(protocol === 'gemini' ? { googleCapabilities: { supportsGemini2Tools: true, usesGemini3Features: !budget } } : {}),
    // Required for Anthropic unknown IDs: do not rely on SDK model-name defaults.
    ...(protocol === 'anthropic' ? { maxOutputTokens: 16384 } : {})
  })
  if (!full) return profile

  profile.vision = true
  profile.functionCalling = true
  profile.nativePdf = protocol !== 'openai'
  profile.generation = {}
  profile.output = { type: 'text' }
  profile.tools.choice = 'auto'
  // Candidate capabilities, not automatically activated tools. The inputbar switches remain authoritative.
  if (protocol !== 'openai') profile.tools.webSearch = 'default'
  if (protocol === 'gemini' || protocol === 'anthropic') profile.tools.urlContext = 'default'
  switch (protocol) {
    case 'openai':
      Object.assign(profile.options, { systemMessageMode: 'developer', strictJsonSchema: true, textVerbosity: 'medium' })
      break
    case 'openai-response':
      Object.assign(profile.options, { reasoningSummary: 'auto', textVerbosity: 'medium', strictJsonSchema: true })
      profile.tools.webSearchOptions = { searchContextSize: 'medium', externalWebAccess: true }
      break
    case 'anthropic':
      profile.options.structuredOutputMode = 'outputFormat'
      profile.tools.webSearchOptions = { maxUses: 5 }
      // Document-source locations are not rendered by Cherry's URL citation UI.
      profile.tools.urlContextOptions = { maxUses: 5, citations: { enabled: false }, maxContentTokens: 10000 }
      break
    case 'gemini':
      profile.options.structuredOutputs = true
      profile.tools.webSearchOptions = { searchTypes: { webSearch: {} } }
      profile.tools.urlContextOptions = {}
      break
  }
  return modelProfileSchema.parse(profile)
}

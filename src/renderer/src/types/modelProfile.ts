import * as z from 'zod'

// Preserve the existing assistant effort slots; labels and API values are independent.
export const profileEffortSchema = z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'auto'])
const parametersSchema = z.record(z.string(), z.json())
const domains = z.array(z.string().min(1))
const locationSchema = z.object({
  type: z.literal('approximate'),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  timezone: z.string().optional()
}).strict()

// SDK tool arguments, not HTTP tool definitions. Reject misspellings instead of dropping them.
export const openaiSearchOptionsSchema = z.object({
  searchContextSize: z.enum(['low', 'medium', 'high']).optional(),
  externalWebAccess: z.boolean().optional(),
  filters: z.object({ allowedDomains: domains.optional(), blockedDomains: domains.optional() }).strict().optional(),
  userLocation: locationSchema.optional()
}).strict()
export const anthropicSearchOptionsSchema = z.object({
  maxUses: z.number().int().positive().optional(),
  allowedDomains: domains.optional(),
  blockedDomains: domains.optional(),
  userLocation: locationSchema.optional()
}).strict()
export const anthropicFetchOptionsSchema = z.object({
  maxUses: z.number().int().positive().optional(),
  allowedDomains: domains.optional(),
  blockedDomains: domains.optional(),
  citations: z.object({ enabled: z.boolean() }).strict().optional(),
  maxContentTokens: z.number().int().positive().optional()
}).strict()
export const googleSearchOptionsSchema = z.object({
  searchTypes: z.object({
    webSearch: z.object({}).strict().optional(),
    imageSearch: z.object({}).strict().optional()
  }).strict().optional(),
  timeRangeFilter: z.object({ startTime: z.iso.datetime(), endTime: z.iso.datetime() }).strict().optional()
}).strict()

export const profileGenerationSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  stopSequences: z.array(z.string().min(1)).optional(),
  seed: z.number().int().optional()
}).strict()

// Pinned SDK request-option keys supported by this chat adapter. Values are also
// checked by the SDK before serialization; this list is not a model whitelist.
export const profileOptionKeys = {
  openai: [
    'logitBias', 'logprobs', 'parallelToolCalls', 'user', 'reasoningEffort', 'store', 'metadata',
    'prediction', 'serviceTier', 'strictJsonSchema', 'textVerbosity', 'promptCacheKey',
    'promptCacheOptions', 'promptCacheRetention', 'safetyIdentifier', 'systemMessageMode', 'forceReasoning'
  ],
  'openai-response': [
    'include', 'instructions', 'logprobs', 'maxToolCalls', 'metadata', 'parallelToolCalls',
    'promptCacheKey', 'promptCacheOptions', 'promptCacheRetention', 'reasoningEffort',
    'reasoningMode', 'reasoningContext', 'reasoningSummary', 'safetyIdentifier', 'serviceTier',
    'store', 'strictJsonSchema', 'textVerbosity', 'truncation', 'user', 'systemMessageMode', 'forceReasoning'
  ],
  anthropic: [
    'sendReasoning', 'structuredOutputMode', 'thinking', 'disableParallelToolUse', 'cacheControl',
    'metadata', 'toolStreaming', 'effort', 'taskBudget', 'speed', 'inferenceGeo', 'anthropicBeta'
  ],
  gemini: [
    'thinkingConfig', 'cachedContent', 'structuredOutputs', 'safetySettings', 'mediaResolution',
    'retrievalConfig', 'serviceTier'
  ]
} as const

export const modelProfileSchema = z.object({
  version: z.literal(1),
  protocol: z.enum(['openai', 'openai-response', 'anthropic', 'gemini']),
  chatDialect: z.enum(['official', 'compatible']).default('official'),
  options: parametersSchema.default({}),
  reasoning: z.array(z.object({
    id: profileEffortSchema,
    label: z.string().min(1).optional(),
    parameters: parametersSchema
  }).strict()).default([]),
  maxOutputTokens: z.number().int().positive().optional(),
  // Missing capability overrides preserve legacy behaviour, including existing profiles.
  vision: z.boolean().optional(),
  functionCalling: z.boolean().optional(),
  nativePdf: z.boolean().optional(),
  generation: profileGenerationSchema.optional(),
  output: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text') }).strict(),
    z.object({ type: z.literal('json') }).strict(),
    z.object({
      type: z.literal('json-schema'),
      name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
      description: z.string().optional(),
      schema: z.object({ type: z.literal('object') }).catchall(z.json())
    }).strict()
  ]).optional(),
  googleCapabilities: z.object({
    supportsGemini2Tools: z.boolean(),
    usesGemini3Features: z.boolean()
  }).strict().optional(),
  sampling: z.object({
    temperature: z.boolean().default(false),
    topP: z.boolean().default(false),
    topK: z.boolean().default(false)
  }).strict().default({ temperature: false, topP: false, topK: false }),
  tools: z.object({
    webSearch: z.enum(['off', 'default', '20250305', '20260209']).default('off'),
    urlContext: z.enum(['off', 'default', '20250910', '20260209']).default('off'),
    webSearchOptions: parametersSchema.optional(),
    urlContextOptions: parametersSchema.optional(),
    choice: z.union([
      z.enum(['auto', 'none', 'required']),
      z.object({ type: z.literal('tool'), toolName: z.string().min(1) }).strict()
    ]).optional(),
    parallel: z.boolean().optional(),
    mixed: z.boolean().default(false),
    unavailableWith: z.array(z.enum(['default', ...profileEffortSchema.options])).default([])
  }).strict().default({ webSearch: 'off', urlContext: 'off', mixed: false, unavailableWith: [] })
}).strict().superRefine((profile, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (new Set(profile.reasoning.map((choice) => choice.id)).size !== profile.reasoning.length) fail('reasoning: duplicate option id')
  if (profile.tools.unavailableWith.some((id) => id !== 'default' && !profile.reasoning.some((choice) => choice.id === id))) {
    fail('tools.unavailableWith must reference default or a configured reasoning option')
  }
  if (profile.chatDialect === 'compatible' && profile.protocol !== 'openai') fail('Compatible dialect requires Chat Completions')
  if (profile.protocol === 'openai' && (profile.tools.webSearch !== 'off' || profile.tools.urlContext !== 'off')) {
    fail('Chat Completions: use Responses for native tools')
  }
  if (profile.protocol === 'openai-response' && profile.tools.urlContext !== 'off') fail('Responses: URL Context is not implemented')
  if (profile.protocol !== 'anthropic' &&
      [profile.tools.webSearch, profile.tools.urlContext].some((value) => value !== 'off' && value !== 'default')) {
    fail('Dated tool versions require Anthropic Messages')
  }
  if (profile.protocol.startsWith('openai') && profile.sampling.topK) fail('OpenAI adapters do not serialize standard topK')
  if (profile.protocol === 'gemini' && profile.tools.parallel !== undefined) fail('Gemini adapter has no parallel tool switch')
  if (profile.protocol === 'anthropic' && profile.output?.type === 'json') fail('Anthropic: use json-schema output, not JSON-only mode')
  if (profile.googleCapabilities && profile.protocol !== 'gemini') fail('googleCapabilities requires Gemini')
  if (profile.protocol === 'gemini') {
    if (!profile.googleCapabilities && (profile.tools.webSearch !== 'off' || profile.tools.urlContext !== 'off' || profile.tools.mixed)) {
      fail('Gemini native/mixed tools require explicit googleCapabilities')
    }
    if (profile.tools.mixed && profile.googleCapabilities?.usesGemini3Features === false) fail('Gemini mixed tools require usesGemini3Features')
    if (profile.googleCapabilities?.supportsGemini2Tools === false &&
        (profile.tools.webSearch !== 'off' || profile.tools.urlContext !== 'off')) fail('Google native tools require supportsGemini2Tools')
  }
  for (const key of ['temperature', 'topP', 'topK'] as const) {
    if (profile.generation?.[key] !== undefined && !profile.sampling[key]) fail(`generation.${key} requires sampling.${key}=true`)
  }
  if (profile.protocol === 'anthropic' && profile.generation &&
      ['presencePenalty', 'frequencyPenalty', 'seed'].some((key) => Object.hasOwn(profile.generation!, key))) {
    fail('Anthropic adapter does not support presencePenalty, frequencyPenalty or seed')
  }
  if (profile.protocol === 'openai-response' && profile.generation &&
      ['presencePenalty', 'frequencyPenalty', 'stopSequences', 'seed'].some((key) => Object.hasOwn(profile.generation!, key))) {
    fail('Responses adapter does not support penalties, stopSequences or seed')
  }
  for (const [name, schema] of [
    ['webSearchOptions', profile.protocol === 'openai-response' ? openaiSearchOptionsSchema :
      profile.protocol === 'anthropic' ? anthropicSearchOptionsSchema :
      profile.protocol === 'gemini' ? googleSearchOptionsSchema : z.object({}).strict()],
    ['urlContextOptions', profile.protocol === 'anthropic' ? anthropicFetchOptionsSchema : z.object({}).strict()]
  ] as const) {
    const options = profile.tools[name]
    if (!options) continue
    const result = schema.safeParse(options)
    if (!result.success) fail(`tools.${name}: ${result.error.message}`)
    if (profile.protocol === 'anthropic' && options.allowedDomains !== undefined && options.blockedDomains !== undefined) {
      fail(`tools.${name}: allowedDomains and blockedDomains are mutually exclusive`)
    }
  }
  const compatible = profile.protocol === 'openai' && profile.chatDialect === 'compatible'
  for (const options of [profile.options, ...profile.reasoning.map((choice) => choice.parameters)]) {
    for (const key of Object.keys(options)) {
      if ([
        'model', 'messages', 'tools', 'stream', 'apiKey', 'baseURL', 'headers', 'fetch',
        '__proto__', 'constructor', 'prototype', 'cherryModelCapabilities',
        'openai', 'openaiCompatible', 'openai-compatible', 'anthropic', 'google',
        'maxOutputTokens', 'maxCompletionTokens', 'max_tokens', 'max_completion_tokens', 'max_output_tokens',
        'temperature', 'topP', 'topK', 'top_p', 'top_k', 'presencePenalty', 'frequencyPenalty', 'stopSequences', 'seed',
        'presence_penalty', 'frequency_penalty', 'stop', 'output', 'responseFormat', 'response_format', 'toolChoice', 'tool_choice'
      ].includes(key)) fail(`Use a dedicated profile field instead of option: ${key}`)
      else if (!compatible && !(profileOptionKeys[profile.protocol] as readonly string[]).includes(key)) {
        fail(`Unsupported ${profile.protocol} option: ${key}. This adapter does not implement every SDK/platform feature.`)
      }
      if (profile.tools.parallel !== undefined && ['parallelToolCalls', 'disableParallelToolUse', 'parallel_tool_calls'].includes(key)) {
        fail('Configure parallel tools in tools.parallel only')
      }
    }
    if (profile.protocol === 'anthropic' && profile.output?.type === 'json-schema' &&
        options.structuredOutputMode !== undefined && options.structuredOutputMode !== 'outputFormat') {
      fail('Anthropic JSON schema output requires structuredOutputMode=outputFormat; auto/jsonTool fallback is not supported')
    }
    const thinking = options.thinking
    if (profile.protocol === 'anthropic' && thinking && typeof thinking === 'object' && !Array.isArray(thinking) && thinking.type === 'enabled') {
      const budget = thinking.budgetTokens
      if (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 1024) fail('Anthropic enabled thinking requires budgetTokens >= 1024')
    }
    const config = options.thinkingConfig
    if (profile.protocol === 'gemini' && config && typeof config === 'object' && !Array.isArray(config) &&
        config.thinkingLevel !== undefined && config.thinkingBudget !== undefined) fail('Use thinkingLevel OR thinkingBudget, not both')
  }
  // Check merged selections too: a level can replace a whole object, never deep-merge it.
  for (const options of [profile.options, ...profile.reasoning.map((choice) => ({ ...profile.options, ...choice.parameters }))]) {
    if (profile.output?.type === 'json-schema' && options.structuredOutputs === false) fail('JSON schema output requires structuredOutputs')
    if (profile.protocol === 'anthropic' && options.thinking && typeof options.thinking === 'object' && !Array.isArray(options.thinking)) {
      const thinking = options.thinking
      const forced = profile.tools.choice === 'required' || typeof profile.tools.choice === 'object'
      if (forced && ['enabled', 'adaptive', 'between_tools'].includes(String(thinking.type))) {
        fail('Anthropic thinking is incompatible with forced tool choice; use auto or none')
      }
      if (thinking.type === 'enabled' && typeof thinking.budgetTokens === 'number' &&
          profile.maxOutputTokens !== undefined && thinking.budgetTokens >= profile.maxOutputTokens) {
        fail('Anthropic budgetTokens must be smaller than the profile default output budget')
      }
    }
  }
})

export type ModelProfile = z.infer<typeof modelProfileSchema>
export type ProfileProtocol = ModelProfile['protocol']

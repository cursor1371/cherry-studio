import { definePlugin, type StreamTextParams, type StreamTextResult } from '@cherrystudio/ai-core'
import { anthropic } from '@cherrystudio/model-sdk-anthropic'
import { google } from '@cherrystudio/model-sdk-google'
import { openai } from '@cherrystudio/model-sdk-openai'
import { loggerService } from '@logger'
import { getProfileEffort, profileNamespaces } from '@renderer/config/modelProfiles'
import store from '@renderer/store'
import type { Assistant } from '@renderer/types'
import { isAiSdkParam } from '@renderer/types/aiCoreTypes'
import {
  anthropicFetchOptionsSchema,
  anthropicSearchOptionsSchema,
  googleSearchOptionsSchema,
  type ModelProfile,
  modelProfileSchema,
  openaiSearchOptionsSchema,
  profileGenerationSchema
} from '@renderer/types/modelProfile'
import { mapRegexToPatterns } from '@renderer/utils/blacklistMatchPattern'
import { type JSONValue, jsonSchema, Output, type ToolSet } from 'ai'
import { t } from 'i18next'

import type { AiSdkMiddlewareConfig } from '../types/middlewareConfig'
import { extractAiSdkStandardParams } from '../utils/options'
import { getCustomParameters } from '../utils/reasoning'

const logger = loggerService.withContext('ModelProfile')

/** Runs after tool injection. Uses SDK options, never modifies the serialized HTTP body. */
export function createModelProfilePlugin(
  input: ModelProfile,
  assistant: Assistant,
  config: AiSdkMiddlewareConfig & { callType?: string }
) {
  const profile = modelProfileSchema.parse(input)
  const namespace = profile.protocol === 'openai' && profile.chatDialect === 'compatible'
    ? 'openaiCompatible' : profileNamespaces[profile.protocol]
  const effort = getProfileEffort(profile, assistant.settings?.reasoning_effort)
  const selected = profile.reasoning.find((choice) => choice.id === effort)?.parameters ?? {}
  const controlledKeys = new Set([
    'thinking', 'thinkingConfig', 'reasoning', 'reasoningEffort', 'reasoning_effort', 'cherryModelCapabilities',
    'openai', 'openaiCompatible', 'openai-compatible', 'anthropic', 'google',
    'model', 'messages', 'tools', 'stream', 'apiKey', 'baseURL', 'headers', 'fetch', '__proto__', 'constructor', 'prototype',
    'maxCompletionTokens', 'max_tokens', 'max_completion_tokens', 'max_output_tokens', 'top_p', 'top_k',
    'presence_penalty', 'frequency_penalty', 'stop', 'output', 'responseFormat', 'response_format',
    'toolChoice', 'tool_choice',
    ...(profile.tools.parallel !== undefined ? ['parallelToolCalls', 'parallel_tool_calls', 'disableParallelToolUse'] : []),
    ...Object.keys(profile.options), ...profile.reasoning.flatMap((choice) => Object.keys(choice.parameters))
  ])

  return definePlugin<StreamTextParams, StreamTextResult>({
    name: 'model-profile',
    enforce: 'post',
    transformParams: (params, requestContext) => {
      const specific: Record<string, JSONValue> = { ...profile.options, ...selected }
      const { standardParams, providerParams } = extractAiSdkStandardParams(getCustomParameters(assistant))
      // Do not silently let an old custom thinking parameter override the visible menu.
      const scoped = providerParams[namespace]
      if (scoped !== undefined && (scoped === null || typeof scoped !== 'object' || Array.isArray(scoped))) {
        throw new Error(`Model profile: custom ${namespace} options must be a JSON object`)
      }
      const providerCustom: Record<string, JSONValue | undefined> = {
        ...providerParams,
        ...(scoped ?? {})
      }
      delete providerCustom[namespace]
      for (const [key, value] of Object.entries(providerCustom)) {
        // Standard options must use the top-level entry, where sampling/token rules apply.
        if (isAiSdkParam(key)) {
          throw new Error(t('models.profile.scoped_standard', {
            defaultValue: '请将标准参数 {{key}} 移出 {{namespace}} 对象，作为顶层自定义参数设置。',
            key,
            namespace
          }))
        }
        if (controlledKeys.has(key)) {
          throw new Error(t('models.profile.conflict', {
            defaultValue: '自定义参数 {{key}} 与能力配置冲突，请删除自定义参数并在能力配置中设置。', key
          }))
        }
        if (value !== undefined) specific[key] = value
      }

      if (namespace === 'openaiCompatible' && 'reasoning_effort' in specific) {
        if (!('reasoningEffort' in specific)) specific.reasoningEffort = specific.reasoning_effort
        delete specific.reasoning_effort
      }
      // Validate after merging assistant parameters too: otherwise an unknown key can
      // bypass the editor and get silently dropped by the official SDK.
      modelProfileSchema.parse({ ...profile, options: specific })
      // Only our pinned OpenAI SDK patch reads this internal field. It is not serialized.
      if (namespace === 'openai') {
        specific.cherryModelCapabilities = { sampling: { ...profile.sampling } }
      }
      const next: StreamTextParams = { ...params, ...standardParams, providerOptions: { [namespace]: specific } }
      for (const key of Object.keys(profileGenerationSchema.shape) as (keyof typeof profileGenerationSchema.shape)[]) {
        if (next[key] === undefined && profile.generation?.[key] !== undefined) {
          Object.assign(next, { [key]: profile.generation[key] })
        }
      }
      for (const key of ['temperature', 'topP', 'topK'] as const) {
        // PluginManager shallow-merges the returned partial; deletion would restore the old value.
        if (!profile.sampling[key]) next[key] = undefined
      }

      const effectiveGeneration = Object.fromEntries(
        Object.keys(profileGenerationSchema.shape)
          .map((key) => [key, next[key as keyof typeof profileGenerationSchema.shape]])
          .filter(([, value]) => value !== undefined)
      )
      modelProfileSchema.parse({ ...profile, generation: effectiveGeneration })

      // Response format is a call option, NOT providerOptions. Keep text deltas for
      // Cherry's existing renderer. Auxiliary calls (title/summary/check) keep their output contract.
      // The prompt plugin has already collected MCP, search, knowledge and memory
      // tools here. The initial config.mcpTools list does not include injected tools.
      const hasPromptTools = Object.keys(requestContext.mcpTools ?? {}).length > 0
      if (config.callType === 'chat' && profile.output && profile.output.type !== 'text' && hasPromptTools) {
        throw new Error(t('models.profile.json_prompt_tools', {
          defaultValue: 'JSON 输出不能与提示词工具混用（包括 MCP、外部搜索、知识库和记忆工具），请改用函数调用或关闭这些工具。'
        }))
      }
      if (config.callType === 'chat' && profile.protocol === 'anthropic' && profile.output?.type === 'json-schema') {
        // Native format only: SDK jsonTool/auto fallback would add a hidden tool
        // after our toolChoice and mixed-tool checks. The schema rejects those modes.
        specific.structuredOutputMode = 'outputFormat'
      }
      if (config.callType === 'chat' && profile.output && next.output === undefined) {
        switch (profile.output.type) {
          case 'text':
            next.output = Output.text()
            break
          case 'json':
            next.output = Output.json()
            break
          case 'json-schema':
            next.output = Output.object({
              schema: jsonSchema<JSONValue>(profile.output.schema),
              name: profile.output.name,
              description: profile.output.description
            })
            break
        }
      }

      let total = next.maxOutputTokens ?? profile.maxOutputTokens
      if (total !== undefined && (!Number.isInteger(total) || total <= 0)) {
        throw new Error('Model profile: maxOutputTokens must be a positive integer')
      }
      const thinking = specific.thinking
      if (profile.protocol === 'anthropic') {
        total ??= 16384
        if (thinking && typeof thinking === 'object' && !Array.isArray(thinking) && thinking.type === 'enabled') {
          const budget = thinking.budgetTokens
          if (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 1024 || budget >= total) {
            throw new Error('Model profile: Anthropic requires 1024 <= budgetTokens < maxOutputTokens')
          }
          // AI SDK adds the budget to maxOutputTokens. Cherry's setting is the total.
          total -= budget
        }
      }
      next.maxOutputTokens = total

      const choice = params.toolChoice ?? (config.callType === 'chat' ? profile.tools.choice : undefined)
      if (hasPromptTools && choice !== undefined && choice !== 'auto') {
        throw new Error('Model profile: tool choice controls native tools, not prompt-based tool use')
      }
      const native: ToolSet = {}
      const search = choice !== 'none' && !!config.enableWebSearch && profile.tools.webSearch !== 'off'
      const context = choice !== 'none' && !!config.enableUrlContext && profile.tools.urlContext !== 'off'
      if ((search || context) && profile.tools.unavailableWith.some((id) => id === effort)) {
        throw new Error(t('models.profile.tools_effort', {
          defaultValue: '当前思考选项与原生工具不兼容，请更换选项或关闭工具。'
        }))
      }
      const searchSettings = store.getState().websearch
      if (profile.protocol === 'openai-response' && search) {
        native.webSearch = openai.tools.webSearch(profile.tools.webSearchOptions !== undefined
          ? openaiSearchOptionsSchema.parse(profile.tools.webSearchOptions)
          : { searchContextSize: searchSettings.maxResults <= 33 ? 'low' : searchSettings.maxResults <= 66 ? 'medium' : 'high' })
      }
      if (profile.protocol === 'anthropic') {
        const blockedDomains = mapRegexToPatterns(searchSettings.excludeDomains)
        // Explicit objects replace global defaults, including an empty object. Do not
        // combine global blockedDomains with a user's allowedDomains.
        const options = profile.tools.webSearchOptions !== undefined
          ? anthropicSearchOptionsSchema.parse(profile.tools.webSearchOptions)
          : { maxUses: searchSettings.maxResults, ...(blockedDomains.length ? { blockedDomains } : {}) }
        if (search) {
          native.webSearch = profile.tools.webSearch === '20260209'
            ? anthropic.tools.webSearch_20260209(options)
            : anthropic.tools.webSearch_20250305(options)
        }
        if (context) {
          const fetchOptions = anthropicFetchOptionsSchema.parse(profile.tools.urlContextOptions ?? {})
          native.urlContext = profile.tools.urlContext === '20260209'
            ? anthropic.tools.webFetch_20260209(fetchOptions)
            : anthropic.tools.webFetch_20250910(fetchOptions)
        }
      }
      if (profile.protocol === 'gemini') {
        if (search) native.webSearch = google.tools.googleSearch(googleSearchOptionsSchema.parse(profile.tools.webSearchOptions ?? {}))
        if (context) native.urlContext = google.tools.urlContext({})
        // Consumed only by our version-scoped SDK patch; never sent to the server.
        if (profile.googleCapabilities) specific.cherryModelCapabilities = { ...profile.googleCapabilities }
      }
      // Gemini's native-only tool branch ignores toolChoice. Removing declarations
      // makes none effective across protocols rather than relying on that branch.
      const tools: ToolSet = choice === 'none' ? {} : { ...params.tools, ...native }
      const values = Object.values(tools)
      if (!profile.tools.mixed && values.some((tool) => tool.type === 'provider') &&
          values.some((tool) => tool.type !== 'provider')) {
        throw new Error(t('models.profile.mixed_tools', {
          defaultValue: '此能力配置不允许原生工具与函数工具混用，请关闭其中一种，或在确认渠道支持后启用 tools.mixed。'
        }))
      }
      if (profile.functionCalling === false && values.some((tool) => tool.type !== 'provider')) {
        throw new Error('Model profile: functionCalling=false, but the request contains function tools')
      }
      next.tools = values.length ? tools : undefined
      // Apply caller-specified toolChoice first. Forced choices must name a tool
      // actually available in this request, never a disabled search/context switch.
      if ((choice === 'required' && !values.length) ||
          (typeof choice === 'object' && !Object.hasOwn(tools, choice.toolName))) {
        throw new Error('Model profile: tool choice requires an available tool')
      }
      if (profile.protocol === 'anthropic' && thinking && typeof thinking === 'object' && !Array.isArray(thinking) &&
          ['enabled', 'adaptive', 'between_tools'].includes(String(thinking.type)) &&
          (choice === 'required' || typeof choice === 'object')) {
        throw new Error('Model profile: Anthropic thinking requires auto/none tool choice')
      }
      if (profile.protocol === 'gemini' && (
        (choice === 'required' && !values.some((tool) => tool.type !== 'provider')) ||
        (typeof choice === 'object' && tools[choice.toolName]?.type === 'provider')
      )) {
        throw new Error('Model profile: Gemini can force function tools only, not Search/URL Context')
      }
      next.toolChoice = values.length ? choice : undefined
      if (values.length) {
        if (profile.tools.parallel !== undefined) {
          if (profile.protocol === 'anthropic') specific.disableParallelToolUse = !profile.tools.parallel
          else specific[namespace === 'openaiCompatible' ? 'parallel_tool_calls' : 'parallelToolCalls'] = profile.tools.parallel
        }
      }
      if (context && profile.protocol === 'anthropic' && !requestContext.isRecursiveCall &&
          anthropicFetchOptionsSchema.parse(profile.tools.urlContextOptions ?? {}).citations?.enabled) {
        window.toast.warning(t('models.profile.fetch_citations_limit', {
          defaultValue: 'Web Fetch 文档引用仅发送给服务端；当前界面不展示文档页码或字符定位引用，不应据此认为引用已经完整保存。'
        }))
      }
      const onStepFinish = params.onStepFinish
      next.onStepFinish = async (event) => {
        if (event.warnings?.length) {
          logger.warn('SDK compatibility warnings', { protocol: profile.protocol, warnings: event.warnings })
          window.toast.warning(t('models.profile.sdk_warning', {
            defaultValue: 'SDK 报告了参数或工具兼容警告，请检查日志与最终请求。'
          }))
        }
        await onStepFinish?.(event)
      }
      return next
    }
  })
}

import { ProviderExtension, type ProviderExtensionConfig } from '@cherrystudio/ai-core/provider'
import { createAnthropic, type AnthropicProvider, type AnthropicProviderSettings } from '@cherrystudio/model-sdk-anthropic'
import { createOpenAICompatible, type OpenAICompatibleProviderSettings } from '@cherrystudio/model-sdk-compatible'
import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider, type GoogleGenerativeAIProviderSettings } from '@cherrystudio/model-sdk-google'
import { createOpenAI, type OpenAIProvider, type OpenAIProviderSettings } from '@cherrystudio/model-sdk-openai'
import type { ProviderV3 } from '@ai-sdk/provider'

// Separate registry IDs: existing providers and their v1 patches are untouched.
export const modelProfileExtensions = [
  ProviderExtension.create({
    name: 'profile-openai-compatible',
    supportsImageGeneration: false,
    create: (settings?: OpenAICompatibleProviderSettings) => {
      if (!settings) throw new Error('Model profile requires provider settings')
      return createOpenAICompatible(settings)
    }
  } as const satisfies ProviderExtensionConfig<OpenAICompatibleProviderSettings, ProviderV3, 'profile-openai-compatible'>),
  ProviderExtension.create({
    name: 'profile-openai',
    supportsImageGeneration: false,
    create: createOpenAI,
    variants: [{
      suffix: 'chat',
      name: 'Profile Chat Completions',
      resolveModel: (provider: OpenAIProvider, id: string) => provider.chat(id)
    }] as const
  } as const satisfies ProviderExtensionConfig<OpenAIProviderSettings, OpenAIProvider, 'profile-openai'>),
  ProviderExtension.create({
    name: 'profile-anthropic',
    supportsImageGeneration: false,
    create: createAnthropic
  } as const satisfies ProviderExtensionConfig<AnthropicProviderSettings, AnthropicProvider, 'profile-anthropic'>),
  ProviderExtension.create({
    name: 'profile-google',
    supportsImageGeneration: false,
    create: createGoogleGenerativeAI
  } as const satisfies ProviderExtensionConfig<GoogleGenerativeAIProviderSettings, GoogleGenerativeAIProvider, 'profile-google'>)
] as const

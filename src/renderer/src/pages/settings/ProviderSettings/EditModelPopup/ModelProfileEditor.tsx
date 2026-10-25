import { createModelProfile, supportsModelProfiles } from '@renderer/config/modelProfiles'
import { useProvider } from '@renderer/hooks/useProvider'
import type { Model } from '@renderer/types'
import { modelProfileSchema, profileOptionKeys, type ProfileProtocol } from '@renderer/types/modelProfile'
import { Alert, Button, Collapse, Flex, Input, Select, Switch, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function ModelProfileEditor({ model }: { model: Model }) {
  const { t } = useTranslation()
  const { provider, updateProvider } = useProvider(model.provider)
  const saved = provider.modelProfiles?.[model.id]
  const [draft, setDraft] = useState(saved ? JSON.stringify(saved, null, 2) : '')
  const [error, setError] = useState('')
  const [full, setFull] = useState(true)
  const preview = useMemo(() => {
    try { return modelProfileSchema.parse(JSON.parse(draft)) } catch { return undefined }
  }, [draft])
  if (!supportsModelProfiles(provider)) return null

  const save = () => {
    try {
      const profile = modelProfileSchema.parse(JSON.parse(draft))
      updateProvider({ modelProfiles: { ...provider.modelProfiles, [model.id]: profile } })
      setDraft(JSON.stringify(profile, null, 2))
      setError('')
      window.toast.success(t('common.save'))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  const reset = () => {
    const profiles = { ...provider.modelProfiles }
    delete profiles[model.id]
    updateProvider({ modelProfiles: profiles })
    setDraft('')
    setError('')
  }

  return (
    <Collapse
      style={{ marginBottom: 12 }}
      items={[{
        key: 'profile',
        label: t('models.profile.title', { defaultValue: '协议能力配置（可选）' }),
        children: (
          <Flex vertical gap={10}>
            <Alert type="info" showIcon message={t('models.profile.hint', {
              defaultValue: '仅用于普通聊天。选择模板后按渠道文档编辑 JSON，再单独保存。参数采用 AI SDK 命名；不会修改真实模型 ID。清除后恢复原版识别。模板不代表服务端支持。'
            })} description={t('models.profile.file_hint', {
              defaultValue: 'PDF 按所选协议处理，可用 nativePdf 覆盖；能力档不使用独立 Files API，超限 PDF 会提示并回退文本提取。Gemini 开启原生/混合工具必须填写 googleCapabilities。'
            })} />
            <Typography.Text type="secondary">
              {saved ? saved.protocol : t('models.profile.auto', { defaultValue: '当前：原版自动识别' })}
            </Typography.Text>
            <Flex gap={8} align="center">
              <Switch checked={full} onChange={setFull} />
              <Typography.Text>{t('models.profile.full_template', {
                defaultValue: '完整候选模板（载入后删除服务端不支持的项目）'
              })}</Typography.Text>
            </Flex>
            {full && <Alert type="warning" showIcon message={t('models.profile.candidate_warning', {
              defaultValue: '候选档位包括关闭、minimal、max 等，并不保证每个模型支持。采样默认禁用，工具不会因载入模板自动调用；请核对后保存。'
            })} />}
            <Select
              value={undefined}
              placeholder={t('models.profile.template', { defaultValue: '载入模板（替换编辑区，尚不保存）' })}
              options={[
                { value: 'openai-plain', label: 'OpenAI Chat Completions / plain' },
                { value: 'openai', label: 'OpenAI Chat Completions / effort' },
                { value: 'openai-response', label: 'OpenAI Responses / effort' },
                { value: 'openai-compatible', label: 'OpenAI-compatible / enable_thinking' },
                { value: 'anthropic-plain', label: 'Anthropic Messages / plain' },
                { value: 'anthropic', label: 'Anthropic Messages / adaptive' },
                { value: 'anthropic-budget', label: 'Anthropic Messages / budget' },
                { value: 'gemini', label: 'Gemini GenerateContent / level' },
                { value: 'gemini-budget', label: 'Gemini GenerateContent / budget' }
              ]}
              onChange={(value: string) => {
                const budget = value.endsWith('-budget')
                const plain = value.endsWith('-plain')
                const protocol = (value === 'openai-compatible' ? 'openai' : budget ? value.slice(0, -7) : plain ? value.slice(0, -6) : value) as ProfileProtocol
                const profile = createModelProfile(protocol, budget, full)
                if (plain) {
                  profile.reasoning = []
                  profile.options = {}
                  profile.sampling = { temperature: true, topP: true, topK: protocol === 'anthropic' }
                }
                if (value === 'openai-compatible') {
                  profile.chatDialect = 'compatible'
                  profile.options = {}
                  profile.reasoning = [
                    { id: 'none', parameters: { enable_thinking: false } },
                    { id: 'auto', parameters: { enable_thinking: true } }
                  ]
                }
                setDraft(JSON.stringify(profile, null, 2))
                setError('')
              }}
            />
            <Input.TextArea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoSize={{ minRows: 6, maxRows: 18 }}
              spellCheck={false}
              aria-label={t('models.profile.json', { defaultValue: '能力配置 JSON（可粘贴导入）' })}
              style={{ fontFamily: 'monospace' }}
            />
            {error && <Alert type="error" showIcon message={error} />}
            {preview?.protocol === 'anthropic' && preview.tools.urlContext !== 'off' && (
              <Alert type="warning" showIcon message={t('models.profile.fetch_citations_limit', {
                defaultValue: 'Web Fetch 文档引用仅发送给服务端；当前界面不展示文档页码或字符定位引用，不应据此认为引用已经完整保存。'
              })} />
            )}
            <Collapse items={[{
              key: 'fields',
              label: t('models.profile.fields', { defaultValue: '可配置字段与适配边界' }),
              children: <Flex vertical gap={8}>
                <Typography.Paragraph>{t('models.profile.fields_help', {
                  defaultValue: 'vision / functionCalling 覆盖普通聊天能力；省略恢复旧判断，false 明确禁用。generation 为通用参数默认值，助手显式值优先。output 支持 text、json、json-schema，只作用于普通聊天请求，不影响标题、总结或连接检查。tools.choice 控制选择，tools.parallel 控制并行（Gemini 不支持该开关）。删除档位即移除菜单项；删除工具或设 off 即不注入。'
                })}</Typography.Paragraph>
                <Typography.Paragraph>{t('models.profile.generation_help', {
                  defaultValue: 'generation 可配置 temperature、topP、topK、presencePenalty、frequencyPenalty、stopSequences、seed；保存时按协议校验，采样值还须启用 sampling。webSearchOptions / urlContextOptions 为对应 SDK 工具参数，显式空对象不继承全局搜索限制。'
                })}</Typography.Paragraph>
                <Typography.Paragraph>{t('models.profile.output_tools_help', {
                  defaultValue: 'JSON 输出不支持提示词工具（包括 MCP、外部搜索、知识库和记忆）；请使用函数调用或关闭工具。Anthropic JSON Schema 仅使用 outputFormat，不允许 auto/jsonTool 回退。原生与函数工具的混用在发送前按实际工具集合校验，不会仅因切换 MCP 模式而关闭搜索。'
                })}</Typography.Paragraph>
                <Typography.Paragraph>{t('models.profile.options_help', {
                  defaultValue: '以下是当前适配器接受的 SDK 选项名，不是原始 HTTP 字段；值和嵌套结构仍须符合 SDK 文档。compatible 方言允许渠道扩展，不能据此认定服务端支持。'
                })}</Typography.Paragraph>
                {preview && <Typography.Text code style={{ overflowWrap: 'anywhere' }}>
                  {profileOptionKeys[preview.protocol].join(', ')}
                </Typography.Text>}
                <Button disabled={!preview} onClick={() => {
                  if (!preview) return
                  setDraft(JSON.stringify({ ...preview, output: {
                    type: 'json-schema', name: 'answer', schema: {
                      type: 'object', properties: { answer: { type: 'string' } },
                      required: ['answer'], additionalProperties: false
                    }
                  } }, null, 2))
                  setError('')
                }}>{t('models.profile.schema_example', { defaultValue: '加入 JSON Schema 示例（仅修改草稿）' })}</Button>
                <Alert type="warning" message={t('models.profile.unsupported', {
                  defaultValue: '未接入：图像生成、完整历史推理状态、电脑操作、Shell、音视频上传、任意原生工具。启用能力档后隐藏图像生成按钮并跳过自动开启，不影响视觉输入。不要把这些字段加入 options。JSON 输出仍按文本展示；兼容渠道是否执行 Schema 约束由服务端决定。'
                })} />
              </Flex>
            }]} />
            <Flex gap={8} wrap>
              <Button onClick={save} disabled={!draft.trim()}>{t('models.profile.save', { defaultValue: '保存能力配置' })}</Button>
              <Button onClick={async () => {
                try {
                  await navigator.clipboard.writeText(draft)
                  window.toast.success(t('message.copied'))
                } catch (error) {
                  setError(String(error))
                }
              }} disabled={!draft}>{t('models.profile.copy', { defaultValue: '复制 JSON' })}</Button>
              <Button danger onClick={reset}>{t('models.profile.reset', { defaultValue: '清除能力配置' })}</Button>
            </Flex>
          </Flex>
        )
      }]}
    />
  )
}

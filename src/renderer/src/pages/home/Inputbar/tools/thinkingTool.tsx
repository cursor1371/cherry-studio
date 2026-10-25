import { isBuiltinReasoningModel, isReasoningModel } from '@renderer/config/models'
import ThinkingButton from '@renderer/pages/home/Inputbar/tools/components/ThinkingButton'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'

const thinkingTool = defineTool({
  key: 'thinking',
  label: (t) => t('chat.input.thinking.label'),
  visibleInScopes: [TopicType.Chat, TopicType.Session],
  condition: ({ model, scope }) => {
    return scope === TopicType.Session ? isBuiltinReasoningModel(model) : isReasoningModel(model)
  },
  render: ({ assistant, model, quickPanel, session, scope }) => (
    <ThinkingButton
      quickPanel={quickPanel}
      model={model}
      assistantId={assistant.id}
      reasoningEffort={scope === TopicType.Session ? session?.reasoningEffort ?? 'default' : undefined}
      onReasoningEffortChange={session?.onReasoningEffortChange}
    />
  )
})

registerTool(thinkingTool)

export default thinkingTool

# v1.9.12：显式模型能力配置与同代 SDK 适配

## 范围

本修改用于私人 Fork 的普通助手聊天：填真实模型 ID，选择接口协议，显式配置思考选项与原生工具。不通过伪造模型 ID 或扩大系列正则进行识别。

未配置能力档的模型继续使用原版供应商实现。新版供应商 SDK 使用 npm 别名并存，不替换旧版图像、嵌入、重排供应商及原补丁。AiProvider 仅为文本 completions 使用能力档；独立图像生成/编辑、嵌入维度检查和模型列表均从原始渠道重新解析，不复用聊天 SDK、地址或配置缓存。同一实例先后执行不同用途也不覆盖彼此的配置。共享 `ai` 和 provider-utils 有同代更新，因此仍存在需要运行验证的公共依赖风险，不能承诺零回归。

不包含主进程 Agent/API Server、图像生成、实时音频、新工具平台或数据库改造。启用聊天能力档后，图像生成按钮隐藏，跳过自动开启；原有 enableGenerateImage 保存值不删除，清除能力档后恢复原判断。视觉图片输入不受此限制。没有重写历史消息持久化，不能宣称完整保存所有新协议的 thinking signature、encrypted reasoning、phase 或原生工具结果。一次 AI SDK 调用内部的工具续轮与从数据库重建下一轮历史不是同一件事。

## 使用

1. 在渠道中添加真实模型 ID，不需要修改成 GPT/Claude/Gemini 的旧前缀。
2. 编辑模型，展开新增的“协议能力配置（可选）”。
3. 载入对应模板，依据实际渠道文档编辑 JSON，点击“保存能力配置”。它与原模型编辑表单分别保存。
4. 删除助手自定义参数里与能力档冲突的 thinking、thinkingConfig、reasoningEffort 等参数。
5. 返回聊天，使用原有思考、联网搜索和 URL Context 按钮。原生工具除了在能力档声明支持，还必须在聊天界面开启。
6. 完整候选模板包含 `vision` 和 `functionCalling`。普通聊天的附件入口、消息转换和 MCP 原生函数分支读取这些字段；不必另外勾选旧能力。省略字段时才沿用原判断。模型列表的旧能力图标仍是原元数据，不是能力档的有效状态。
7. 清除能力配置即可恢复该模型的原版识别。普通模型列表刷新不修改渠道上的 modelProfiles；删除整个渠道会一并删除配置。删除模型再添加同 ID 会重新使用此前保留的能力档。

能力档按渠道 ID 与完整模型 ID 隔离，协议保存在能力档里。不根据模型名称自动猜测未来模型的具体能力。

## 四类协议与方言

| protocol | 实际实现 | 参数示例 |
|---|---|---|
| openai，chatDialect=official | 新版 @ai-sdk/openai Chat Completions | reasoningEffort -> reasoning_effort |
| openai，chatDialect=compatible | 新版 @ai-sdk/openai-compatible | reasoningEffort、enable_thinking、thinking 等渠道扩展 |
| openai-response | 新版 @ai-sdk/openai Responses | reasoningEffort -> reasoning.effort |
| anthropic | 新版 @ai-sdk/anthropic Messages | thinking.budgetTokens -> thinking.budget_tokens；effort -> output_config.effort |
| gemini | 新版 @ai-sdk/google GenerateContent | thinkingConfig -> generationConfig.thinkingConfig |

`enable_thinking`、兼容接口的 `thinking` 等不属于 OpenAI 官方标准。必须选择 compatible 方言并确认渠道支持。

此入口只适用于普通 API Key 提供商。OAuth、Azure、Bedrock、Vertex、Copilot、OpenRouter 等专用认证/路由路径保留原版，不强制变成普通直连接口。可以另建一个普通自定义渠道用于明确的兼容协议。

API 地址沿用渠道配置。默认补 `/v1`，Gemini 补 `/v1beta`；末尾 `#` 的显式地址仍按原地址规则处理。只调整末尾已知版本段，不替换模型 ID。新版 Google SDK 补丁保留原版对带 `/` 渠道别名的路径兼容：`vendor/route-a` 使用 `models/vendor/route-a`；包含 `models/` 的路径以及以 `tunedModels/`、`publishers/`、`projects/` 开头的资源路径保留。只处理 URL 资源路径，不替换实际模型 ID。

## 完整候选模板与删除语义

编辑器的“完整候选模板”开关默认开启，关闭后载入原有基础模板。载入只替换草稿，不自动保存。plain 模板不额外声明思考模式；effort、adaptive、budget、level 分别提供相应协议行为。不要把完整候选列表当作任意模型的能力保证。

- OpenAI effort 候选：none、minimal、low、medium、high、xhigh、max。
- Anthropic adaptive 候选：disabled、between_tools、low、medium、high、xhigh、max；模型禁止关闭或不支持 between_tools 时删除相应项。
- Anthropic budget：disabled、三个预算示例；不要用于只接受 adaptive 的接口。
- Gemini level：minimal、low、medium、high；budget：0、三个预算示例、-1。level 和 budget 不同时发送。
- max 使用原有 auto 存储槽位及自定义 label，不更改旧版全局枚举。
- 完整模板默认声明视觉和函数能力，用户须删除或设 false。搜索/抓取还需要聊天界面开关为开启；不自动打开开关。
- 删除 `reasoning` 中一项会移除菜单项；删除 options 中字段不再额外发送；删除 tools.webSearch/urlContext 等同 off。
- 删除 `vision` / `functionCalling` 恢复旧识别；**要明确禁止请设 false**。删除 sampling 子项等同 false。
- 未配置能力档的模型不进入新参数插件。本轮没有修改原模型系列正则。

### 通用生成参数 generation

这里使用 AI SDK 顶层字段，而非 HTTP 的 snake_case。默认值优先级：顶层助手自定义参数 > 调用方/已开启的助手设置 > generation。采样禁用规则最后执行。关闭助手温度开关表示不覆盖 generation；要完全不发送，应同时关闭 sampling 对应项并删除 generation 默认值。助手设置页会展示此说明和配置值。

允许字段按协议限制：

| 协议 | generation 字段 |
| --- | --- |
| Chat Completions / compatible | temperature、topP、presencePenalty、frequencyPenalty、stopSequences、seed |
| Responses | temperature、topP |
| Anthropic | temperature、topP、topK、stopSequences |
| Gemini | temperature、topP、topK、presencePenalty、frequencyPenalty、stopSequences、seed |

以上表示适配器能表达，具体模型可能不支持。不要把采样参数直接加入推理模板。示例仅用于确认支持采样的 Chat 接口：

```json
{
  "sampling": {"temperature": true, "topP": false, "topK": false},
  "generation": {"temperature": 0.7, "presencePenalty": 0.2, "stopSequences": ["END"]}
}
```

输出长度继续使用独立的 `maxOutputTokens`，不在 generation 重复定义。

### 结构化输出 output

默认 `{"type":"text"}`，也可以删除 output，使用调用方原行为。JSON 模式为 `{"type":"json"}`（Anthropic 适配器要求使用 json-schema）。JSON Schema 示例：

```json
{
  "type": "json-schema",
  "name": "answer",
  "description": "Return the answer as JSON",
  "schema": {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
    "additionalProperties": false
  }
}
```

把它放入根字段 output；编辑器有加入示例按钮。根 schema 必须是对象。实现使用 AI SDK Output.json / Output.object + jsonSchema，不把 response_format 放进 providerOptions：

- Chat：response_format；compatible 显式启用 supportsStructuredOutputs。
- Responses：text.format。
- Anthropic：JSON Schema 固定使用 structuredOutputMode=outputFormat，不按未知 ID 猜测。配置 options、任一思考档位或助手自定义参数中的 auto/jsonTool 会报错，避免 SDK 在工具校验后隐式添加 json 函数工具。接口不支持原生输出格式时，应删除 output 或改用 text，不自动退回工具模拟。
- Gemini：generationConfig 的响应 MIME/Schema。

仅 `callType=chat` 应用输出配置和 tools.choice，不强制标题、总结、连接检查返回 JSON。调用方已有 output 时优先保留。JSON 仍以文本流展示，不新增表单或对象数据库。为了保持输出文本，不执行搜索链接 Markdown 转换或 `<think>` 标签提取。

本地只校验配置结构和 schema 根类型，不新增完整 JSON Schema 校验器；schema 方言/支持子集由所选 SDK 与服务端处理，当前文本消费路径不承诺对返回对象作完整本地 schema 验证。请在提示词说明 JSON 要求，不依赖某些兼容渠道自动补提示词。

### 原生工具参数

保留已有 tools.webSearch/urlContext 的启用/版本值，新增对应的 `webSearchOptions` / `urlContextOptions`。

- **省略参数对象**：保留之前的全局搜索默认值。
- **显式对象（包括 `{}`）**：整体替换默认值，不深合并，避免 allowedDomains 与全局 blockedDomains 同时发出。
- 删除工具声明后，其 options 可以保留供以后使用，但不会注入工具。

| 协议/工具 | 可配置 SDK 参数 |
| --- | --- |
| Responses Web Search | searchContextSize、externalWebAccess、filters.allowedDomains/blockedDomains、userLocation |
| Anthropic Web Search（20250305/20260209） | maxUses、allowedDomains 或 blockedDomains、userLocation |
| Anthropic Web Fetch（20250910/20260209） | maxUses、allowedDomains 或 blockedDomains、citations.enabled、maxContentTokens |
| Gemini Google Search | searchTypes.webSearch/imageSearch、timeRangeFilter.startTime/endTime |
| Gemini URL Context | 当前 SDK 无参数，使用空对象 |

**Web Fetch 引用边界（R03 降级处理）：** Anthropic 完整模板的 citations.enabled 默认 false。当前适配器只展示 URL 来源，不展示文档页码/字符区间的定位引用。用户仍可显式开启服务端引用，但编辑器显示限制说明，实际启用抓取并发送引用配置时也会提示；不应视为文档引用已完整展示或持久化。本轮没有扩展消息结构和引用 UI，普通 Web Search 的 URL 引用不受影响。

userLocation 为 `{ "type": "approximate", "country": "US" }` 等 SDK 结构，city/region/timezone 可选。时间范围使用 ISO UTC 字符串。不认识的工具字段会在保存/发送前报错。

工具选择：`tools.choice` 可填 auto、none、required，或 `{"type":"tool","toolName":"webSearch"}`。强制选择需要当前请求中实际存在该工具，不能指定关闭的搜索；Anthropic 思考模式不允许强制工具选择。required 会约束每个 SDK 步骤，可能持续调用到现有步骤上限，请慎用。none 会移除实际工具声明，优先于聊天工具开关（Google 原生工具分支不可靠地处理 none，因此不能只传一个选择字段）。Gemini 的强制选择仅适用于函数工具，不用于 Search/URL Context。实际存在提示词工具时不支持此处非 auto 的选择；只有模式开关、没有实际提示词工具时不会误报，原生工具仍按所选协议校验。JSON 输出不能与实际提示词工具同时使用（包括 MCP、外部搜索、知识库和记忆注入的工具）。插件检查提示词转换后上下文中的实际工具，不只检查原始 MCP 列表。需要这些工具时，应改用函数调用模式或文本输出。

`tools.parallel` 为可选布尔值，映射 OpenAI parallelToolCalls / compatible parallel_tool_calls / Anthropic disableParallelToolUse 的反值。Gemini 适配器没有此开关，保存时拒绝。省略时不覆盖 SDK 默认。不要同时在 options 另写并行参数。

### 能力边界与严格字段校验

这一轮扩展的是已接通能力的配置入口，不是整个平台功能全集。仍未接入 File Search/Code Execution/Computer Use/Shell、音视频与大文件上传、Interactions/WebSocket、完整历史推理状态及中断恢复。不提供这些功能的空开关。

官方 options 的一级允许键见编辑器及 `types/modelProfile.ts` 的 profileOptionKeys。旧配置中此前会被 SDK 忽略的任意字段，现在可能被明确拒绝；需删除、改用专用字段，或在确认是渠道扩展时选择 compatible。嵌套选项值仍由 SDK 校验，不能宣称所有拼写或型号限制均已本地校验。

SDK 中未被原补丁覆盖的型号约束（例如部分服务等级、推理模式修正）仍可能产生警告或调整；配置不等于服务端接受。本轮没有进一步扩大 SDK 补丁范围，也未加入任何模型 ID 特判。

## 配置字段

- `version`: 固定为 1。
- `protocol`: 上表四类协议之一。
- `chatDialect`: official（默认）或 compatible，仅 Chat Completions 可选择后者。
- `options`: 当前适配器支持的 SDK 供应商选项，不包 openai/anthropic/google 外层，不是原始 HTTP 请求体。官方模式校验一级字段名，值及嵌套结构还需符合固定 SDK；编辑器列出允许的字段。未接入状态恢复/执行环境的字段不开放。compatible 方言可填写渠道扩展，但不能覆盖身份、标准参数、工具选择及输出格式。
- `reasoning`: 思考菜单项数组。每项包括 `id`、可选 `label`、`parameters`。
- `maxOutputTokens`: 默认总输出预算，助手启用的最大输出限制优先。Anthropic 未设置时使用 16384，避免未知模型依赖 SDK 的保守默认值；这不是对服务端上限的判断。
- `sampling`: 是否允许 temperature/topP/topK；模板默认全部关闭。具体数值仍在助手设置中填写。被配置禁用的温度/Top P 控件会置灰，保存值不删除。新 OpenAI SDK 补丁使显式允许的温度/Top P 不再被模型名规则删除；它不会证明服务端支持，必须确认所配置的思考档位下这些参数合法。OpenAI 两类接口（含 compatible 适配器）不序列化标准 topK，因此配置校验禁止开启。
- `nativePdf`: 可选布尔值，覆盖原生 PDF 支持。省略时 Gemini、Anthropic、Responses 默认原生处理，Chat Completions 默认提取文本；确认渠道支持 Chat 文件部件后可设为 true。能力档不走独立 Files API，超限 PDF 会提示并回退文本提取，不会按旧渠道类型上传。文件大小限制和 Anthropic JPG MIME 转换按实际协议判断。
- `tools.webSearch`: off/default，Anthropic 还可选 20250305/20260209。
- `tools.urlContext`: off/default，Anthropic 还可选 20250910/20260209。
- `tools.mixed`: 是否允许原生工具与函数工具混用，默认 false。能力档模式下，UI 不再依据 MCP 模式、服务器数量或残留的 function 选择阻止开启原生工具，也不自动改写搜索开关；发送前按工具注入后的实际集合校验。真实冲突会报错，不会带着冲突工具发送。未配置能力档的原版 UI 限制保持不变。
- `tools.unavailableWith`: 不能与原生工具同时使用的思考选项 ID，也可包含 default。引用的非 default 选项必须存在于 reasoning。UI 和请求按同一个有效选项检查。`tools.choice=none` 时不发送原生工具，UI 不会因残留的工具开关状态阻止选择档位；开关保存值仍保留，恢复 auto 后重新检查真实组合。
- `googleCapabilities`: Gemini SDK 的显式能力覆盖。`supportsGemini2Tools` 控制 Search/URL Context；`usesGemini3Features` 控制新式消息/工具转换。它不是模型 ID，不进入 HTTP 请求体。等级模板设为 true/true，预算模板设为 true/false；必须按实际渠道能力调整。Gemini 声明原生工具或 mixed 时必须填写该对象；Search/URL Context 要求 supportsGemini2Tools=true，mixed 要求 usesGemini3Features=true。

自定义标准参数（如 temperature、topP、maxOutputTokens）必须作为独立顶层参数填写，不可藏在 openai/openaiCompatible/google/anthropic 对象里。命名空间内的标准参数会明确报错，而不是绕过采样限制。已有不满足新增校验的配置请修正后重新保存。

Agent Session 的思考按钮保持原版能力判断和选项，不读取普通聊天能力档，也不会通过该按钮的助手 Hook 同步普通聊天的思考设置。

菜单永远有“默认”：仅使用 options，不附加某个档位的 parameters。参数合并采用浅覆盖；如档位定义了 thinking 对象，它必须包含完整的 thinking 参数，不做隐式递归混合。

为减少对旧版的影响，没有扩展全项目 ReasoningEffortOption 枚举。菜单沿用 7 个已有持久化槽位：none/minimal/low/medium/high/xhigh/auto。label 和实际参数可独立配置。例如保留 xhigh，再把 auto 显示为 max 并发送 max；不会把 API 的 max 偷换成 xhigh。最多 7 个自定义菜单项，外加 default。不要使用 none 表示 between_tools，建议使用 minimal 并标明真实语义。

## Gemini 等级示例

以下只是协议模板，不宣称某个未知型号一定支持所有字段。

```json
{
  "version": 1,
  "protocol": "gemini",
  "options": {},
  "reasoning": [
    {"id": "low", "parameters": {"thinkingConfig": {"includeThoughts": true, "thinkingLevel": "low"}}},
    {"id": "medium", "parameters": {"thinkingConfig": {"includeThoughts": true, "thinkingLevel": "medium"}}},
    {"id": "high", "parameters": {"thinkingConfig": {"includeThoughts": true, "thinkingLevel": "high"}}}
  ],
  "googleCapabilities": {"supportsGemini2Tools": true, "usesGemini3Features": true},
  "sampling": {"temperature": false, "topP": false, "topK": false},
  "tools": {"webSearch": "default", "urlContext": "default", "mixed": false, "unavailableWith": []}
}
```

只有服务端确认支持混合工具后，才把 mixed 改为 true。预算模型改用 thinkingBudget，不同时发送 thinkingLevel；0/-1 的关闭/自动语义以该型号文档为准。

显式配置模式默认使用 SDK 的安全设置默认值。若要沿用特定 safetySettings，请在 options 中显式填写；本修改不调整未配置模型的原版 safetySettings。

## Responses 的 xhigh 与 max

在确认模型支持后，给模板 reasoning 数组增加：

```json
{"id": "xhigh", "label": "xhigh", "parameters": {"reasoningEffort": "xhigh"}}
```

```json
{"id": "auto", "label": "max", "parameters": {"reasoningEffort": "max"}}
```

options 可以设置该 SDK 支持的 reasoningSummary、reasoningMode、reasoningContext 等。SDK 支持并不等于当前渠道/模型支持。不要把不支持 none 的模型配置成可关闭。

Chat Completions 的官方模式使用 forceReasoning 以支持非标准模型 ID；函数调用是否可用取决于具体型号及协议。需要 OpenAI 原生搜索时使用 Responses，不向普通 Chat Completions 塞 Responses 工具。

## Claude

- adaptive：`{"thinking":{"type":"adaptive","display":"summarized"},"effort":"high"}`。
- budget：`{"thinking":{"type":"enabled","budgetTokens":4096}}`。
- 允许关闭的模型：`{"thinking":{"type":"disabled"}}`，可绑定 none 槽位。
- 支持 between_tools 的模型：`{"thinking":{"type":"between_tools"},"effort":"low"}`，建议绑定 minimal 槽位并设置 label。

不默认开放关闭；不同 Claude 系列的关闭行为不相同。新版 SDK 对已知型号仍可能调整不合法的配置并产生警告。预算必须满足 `1024 <= budgetTokens < 总输出限制`；插件只扣除一次 SDK 随后会加回的预算。

Anthropic tools 的 default 分别使用 webSearch_20250305 和 webFetch_20250910；可明确选择 20260209。2026 版有动态过滤/服务器代码执行相关行为，本实现没有伪造 allowed_callers 控制（该版本 SDK 不会在这两种原生工具上读取它）。不能接受这些行为的渠道应使用旧版工具。

## 兼容接口开关示例

```json
{
  "version": 1,
  "protocol": "openai",
  "chatDialect": "compatible",
  "options": {},
  "reasoning": [
    {"id": "none", "label": "关闭", "parameters": {"enable_thinking": false}},
    {"id": "auto", "label": "开启", "parameters": {"enable_thinking": true}}
  ]
}
```

支持 thinking 对象的渠道可把 parameters 换为 `{"thinking":{"type":"enabled"}}` 等文档格式。兼容模式优先使用 camelCase reasoningEffort，代码也会处理 snake_case reasoning_effort 的 SDK 覆盖问题。更多协议字段仍受所选 SDK 的序列化能力限制，不是任意 JSON 透传。

## 构建及依赖锁定

已选择同代发布版本：ai 6.0.315、OpenAI 3.0.131、Anthropic 3.0.135、Google 3.0.138、OpenAI-compatible 2.0.87、provider 3.0.19、provider-utils 4.0.62。供应商包用 @cherrystudio/model-sdk-* 别名隔离。Zod 最低约束提高至 ^4.1.8，以符合新 SDK peerDependencies。

依赖锁文件及 SDK 补丁必须由准备流程实际生成，不能手工伪造完整性哈希。此前本地准备在原生依赖安装阶段失败，不代表锁文件或补丁已经准备完成；需以准备流程成功及生成文件审查为准。推荐直接使用下述 GitHub Actions，无需在本地配置 C++/Electron 构建环境。

准备脚本：

```bash
node scripts/prepare-model-sdk.cjs --prepare
```

这是可选的本地准备命令，也由 Actions 调用。脚本先检查实际 pnpm 版本与 package.json 的 packageManager 一致（当前为 10.27.0），不一致即在安装前停止；不会自动升级 pnpm 或迁移项目配置。

准备过程的全部 pnpm 命令统一使用 `--config.ignore-scripts=true`，并只给子进程设置 `npm_config_ignore_scripts=true`。这覆盖首次安装、patch-commit 内部安装、最终冻结校验，以及补丁已经提交时的快速路径。不会执行项目/依赖的安装生命周期、原生模块编译或 Git Hook 安装，也不修改用户永久配置和调用者环境。无需手动设置 PowerShell 环境变量。

脚本仍会下载/链接依赖，使用 ts-morph 为固定 Google/OpenAI SDK 生成两份补丁：Google 的工具/消息能力覆盖及渠道路径兼容；OpenAI 的显式温度/Top P 过滤覆盖。随后更新锁文件并执行跳过生命周期的冻结安装。两份补丁均覆盖公开/internal、ESM/CommonJS 入口；版本或 AST 匹配数量不符立即失败。修正后的脚本本次未执行，不等于补丁产物已经生成。

脚本检查补丁修订标记。若此前生成过旧版同版本补丁，请只移除旧生成文件及其对应注册后重新准备；不要删除原版 Google 3.0.64、OpenAI 3.0.53 等补丁。

`build-custom.yml` 将依赖准备与正式构建安装分开：

1. 准备阶段调用上述脚本，跳过生命周期，并上传 `model-sdk-dependencies-*` 和完整源码附件。
2. 手动运行勾选 `dependencies_only` 时，到此结束；不执行原生依赖构建、应用编译或打包。
3. 正式构建（push 或未勾选该选项）仅在 GitHub runner 上显式恢复生命周期，执行：

   ```bash
   pnpm --config.ignore-scripts=false install --frozen-lockfile
   pnpm --config.ignore-scripts=false --config.include-workspace-root=true -r rebuild --pending
   ```

   第二条用于补执行准备时已链接但未构建的依赖，覆盖全部 workspace 和根项目；继续遵守原来的 onlyBuiltDependencies 白名单，不开放任意依赖脚本。
4. 正常安装和 pending rebuild 均成功后才执行原有应用编译、打包。失败就停止，不通过忽略生命周期强行打包。

跳过脚本生成的本地 node_modules 不是完整开发运行环境，不要复制到 CI；原生安装问题留在 runner 排查，不要求本地安装 Visual Studio。以上流程本次尚未实际运行。

请审查附件中的 package.json、pnpm-lock.yaml、pnpm-workspace.yaml 和生成的 Google、OpenAI 两份补丁，再纳入工作树。pnpm 的 overrides/peer 解析可能连带改变传递依赖，需要检查锁文件差异，不能假设只有指定的几个包发生变化。补丁注册及锁文件进入仓库后，准备脚本自动使用跳过生命周期的 frozen install，不再反复修改 SDK；正式构建仍会单独正常安装并补跑 pending builds。

如果严格要求整个改动只产生一个最终 Git 提交，应在有 Node/pnpm 的 Codespaces 中打开未提交的工作树、运行准备脚本并取回生成文件，再一次性提交。若先提交到 GitHub 才运行 Actions，引入云端生成文件必然需要后续提交或在私人分支 amend；不能把这种过程说成已经完成一次性提交。本次没有执行任何 Git 提交。

## 完整文件、审查报告与一次性提交

- 完整源码：本地项目相应路径，文件清单见 `docs/zh/guides/model-adaptation-files.txt`。
- 修改说明、恢复执行记录、人工审查与剩余风险：`docs/zh/guides/model-adaptation-review.md`。
- 后续 Actions 的 `model-adaptation-source-*` 附件会包含完整修改文件（不是 diff），以及那次运行生成的依赖清单和 SDK 补丁。

若需要本地完整源码的单一文本副本，可在 PowerShell 中执行以下纯文件读取/导出命令，不需要 Node、编译或测试：

```powershell
cd D:\AI_Workspace\cherry-studio
$files = Get-Content -Encoding UTF8 docs/zh/guides/model-adaptation-files.txt
$content = foreach ($file in $files) {
  "===== BEGIN $file ====="
  Get-Content -Raw -Encoding UTF8 -LiteralPath $file
  "===== END $file ====="
}
$content | Set-Content -Encoding UTF8 ..\cherry-model-adaptation-full-source.txt
```

在依赖准备完成、生成文件已经取回并审查之后，才执行最终一次提交：

```powershell
git add --pathspec-from-file=docs/zh/guides/model-adaptation-files.txt
git add pnpm-lock.yaml pnpm-workspace.yaml patches/@ai-sdk__google@3.0.138.patch patches/@ai-sdk__openai@3.0.131.patch
git diff --cached --stat
git diff --cached
git commit --signoff -m "feat: add opt-in model profiles with updated AI SDK adapters"
git push origin compat-v1.9.12
```

上述生成补丁路径不存在时不要跳过，先完成依赖准备。不要使用 `git add -A` 混入其他工作区文件或凭据；本说明没有替你执行提交。

## 验证边界

用户已确认前一次模板类型修复后的 GitHub 构建成功；这不等于后续 C02/C03/C04 修复已通过构建。本轮没有修改已成功构建的 SDK 版本、锁文件、补丁脚本或工作流，提交后沿用现有 CI 验证。

本次仅人工静态审查，没有安装、编译、类型检查、lint、格式化命令、测试或渠道请求。不能把源码审查等同于构建通过、服务端功能通过或零回归。请至少在你后续使用构建产物时检查：真实 URL/model 不变；菜单改变最终请求；默认与关闭不同；tools 确实存在；异常会提示；原模型及多轮工具请求无异常。

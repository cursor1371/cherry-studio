# 模型能力适配：修改与人工静态复审报告

## 最新复审：R01–R05 最小修正

### 结论与验证等级

已完成 R01、R02、R04、R05 的应用层修正；R03 采用审查报告允许的最小降级方案：模板默认关闭 Web Fetch 文档引用，并在编辑器和实际发送时说明限制，**没有实现文档引用定位展示或持久化**。

本轮完整读取了修改前的相关文件，检查插件顺序、请求上下文、配置保存/自定义参数合并、工具集合、UI 状态和响应来源分支，并在修改后回读全部最终改动的应用源码。未发现这些修正范围内尚未处理的明确阻断性问题；这不是全项目无缺陷、构建成功或零回归证明。

未安装依赖，未执行 SDK 准备脚本、类型检查、编译、lint、格式化命令或测试；未新增测试文件，未执行 Git 命令、提交或推送。所有场景结果都是人工静态推演，不是运行用例。

### 本轮最终修改范围

9 个应用源码文件、1 个工作流文件（只补源码附件路径）、3 份既有文档；无新增运行时文件、无依赖版本或 SDK 补丁算法变动。

```text
src/renderer/src/aiCore/plugins/modelProfilePlugin.ts
src/renderer/src/types/modelProfile.ts
src/renderer/src/config/modelProfiles.ts
src/renderer/src/pages/settings/ProviderSettings/EditModelPopup/ModelProfileEditor.tsx
src/renderer/src/pages/home/Inputbar/tools/components/WebSearchQuickPanelManager.tsx
src/renderer/src/pages/home/Inputbar/tools/components/UrlContextbutton.tsx
src/renderer/src/pages/home/Inputbar/tools/components/MCPToolsButton.tsx
src/renderer/src/pages/home/Inputbar/tools/generateImageTool.tsx
src/renderer/src/pages/home/Inputbar/Inputbar.tsx
.github/workflows/build-custom.yml
docs/zh/guides/model-adaptation.md
docs/zh/guides/model-adaptation-review.md
docs/zh/guides/model-adaptation-files.txt
```

这是本轮人工记录，不是 Git diff 扫描结果。完整累计清单已纳入 generateImageTool.tsx。

### R01：实际提示词工具与 JSON 输出冲突

- 请求插件改用 `transformParams(params, requestContext)`，检查 `requestContext.mcpTools` 的有效键数量。
- 搜索编排插件为 pre，提示词插件为 normal，能力档插件为 post；后者能看到 MCP、外部搜索、知识库和记忆经过提示词转换后的实际集合。
- JSON/JSON Schema 检查独立于 `next.output === undefined`，已有输出对象不能绕过配置档的冲突检查。
- 无实际提示词工具时不因模式开关而报此错误。文本输出、没有能力档的原路径不变。
- 冲突在主聊天 SDK 调用前报错；原有前置意图分析流程没有被重写。

### R02：禁止 Anthropic 结构化输出隐藏工具回退

- 当 `protocol=anthropic` 且 `output.type=json-schema` 时，Schema 只允许未设置 `structuredOutputMode` 或明确设置 `outputFormat`。
- 配置 options 和每个 reasoning.parameters 都检查，助手自定义参数合并后再次检查。auto、jsonTool、null 等值不能绕过。
- 聊天请求显式写入 `outputFormat`，不依赖未知 ID 的默认能力判断，不使用 SDK 的 JSON 函数工具回退。
- 不支持原生格式的接口需改为 text/删除 output，不自动模拟；这是有意收紧旧配置。
- 没有增加工具、没有放宽 tools.mixed/functionCalling/toolChoice 校验。文本及辅助调用不由本轮强制添加输出格式。

### R03：Web Fetch 文档引用的受限降级

- 读取 AiSdkToChunkAdapter 后确认它只收集 URL 来源；没有把无 URL 的 document 伪造成网络链接。
- Anthropic 完整模板改为 `citations.enabled=false`。
- 编辑器在 Anthropic Web Fetch 声明开启时显示定位引用缺失的说明。
- 兼容此前已保存的 enabled=true：当请求实际注入 Web Fetch 且请求引用时发出提示；递归调用不重复该提示。不改写用户显式选择。
- 抓取关闭、choice=none 或 enabled=false 时不发请求提示；普通 Web Search 的 URL 来源处理不变。
- **剩余能力限制：document 类型来源仍不进入引用展示/保存。这是降级处理，不是完整修复引用响应链路。**

### R04：UI 不再凭模式推测实际工具集合

- 能力档路径移除 Web Search/URL Context 按 MCP 模式和残留 function 选择做出的预先阻断。
- MCP 模式切换、服务器选择不再自动关闭能力档的原生搜索/抓取开关。
- 未配置能力档时，原 Gemini/URL Context UI 限制保持原分支。
- 真正的混用限制仍在参数插件处理：工具注入和提示词转换完成后，根据 provider/function 工具实际集合判断。仅开启原生工具不误报；真实不允许的混用仍报错。
- 思考选项 unavailableWith、functionCalling=false、强制工具是否可用等末端检查保留。

### R05：聊天能力档的图像生成入口一致性

- generateImageTool 的可见性明确排除 getModelProfile(model)，只对普通聊天生效。
- Inputbar 的图像自动开启/关闭部分对聊天能力档跳过；保留 enableGenerateImage 保存值供清除能力档后恢复原行为。不影响同一 effect 前面的搜索处理。
- 请求端原有 `!profile` 图像生成限制保留，与按钮范围一致；视觉输入分支不受影响。
- 复核 useAssistant 已在 profile 变化时使 assistantWithModel 引用失效，InputbarTools 的现有 assistant 依赖足以重算按钮。执行中曾添加重复订阅，复核后已撤除；InputbarTools.tsx 最终恢复本轮修改前内容，不纳入本轮清单。
- Session 不采用新增的图像 effect 排除规则，主进程及图像供应商实现不变。

### 静态场景矩阵

| 场景 | 源码推演结果 |
| --- | --- |
| JSON + 无 MCP，但实际注入提示词搜索/知识库/记忆 | 从 requestContext 识别并拒绝 |
| JSON + prompt 模式，但实际工具为空 | 不触发提示词工具冲突 |
| JSON + 原生函数工具 | 不被 R01 误拦，仍受已有 mixed/choice 约束 |
| Anthropic Schema + options/档位/custom 中 jsonTool 或 auto | 保存或合并校验报错 |
| Anthropic Schema + 未填结构化模式 + choice=none | 明确 outputFormat；工具声明为空，不启用工具回退 |
| Web Fetch 新模板 | 引用默认关闭 |
| Web Fetch 旧 enabled=true 配置 | 保留请求参数，并明确提示文档引用不展示 |
| manual 模式、空 MCP 列表、mixed=false | UI 可开启原生工具，实际集合只有原生时不误报 |
| 原生工具 + 实际函数工具、mixed=false | 主聊天发送前报错，不静默关闭开关 |
| 带能力档的旧生图型号 | 按钮隐藏、跳过自动开启、请求仍不走生图分支 |
| 清除能力档 | 既有 Hook 触发重算，恢复旧按钮/自动开启规则 |

### 保留风险与交付状态

1. B01 不在本轮修复范围。复查 patches 目录仍无 Google 3.0.138/OpenAI 3.0.131 生成补丁；本轮没有更新锁文件或运行冻结安装。既有依赖准备及构建必须由后续流程完成。
2. 新版 SDK 的实际序列化、渠道对 outputFormat 的支持、工具流式响应均未实测；不能将应用层约束修正等同于所有渠道兼容。
3. 完整多轮 reasoning/工具元数据持久化仍未实现；高级原生工具、音视频和大文件范围不变。
4. 新提示继续使用 i18next 中文 defaultValue，没有扩充全部语言资源或执行格式检查。
5. 本轮没有重新全面审计所有累计修改，也没有检查清单外的 Git 差异。结论仅覆盖 R01–R05 的相关修正链路。

---

## 历史记录：协议模板扩展

以下旧结论保留为执行记录；随后发现的 R01–R05 及本轮处理结果以上节为准。

### 当轮结论

已在 F01–F07 修复后的工作树上扩展协议配置入口。新增能力只对显式配置档生效，没有新增模型 ID 正则、数据库结构、执行环境或依赖包。人工完整阅读修改文件、核对逐项编辑差异，并回读核心 Schema、模板、编辑器和请求插件后，在本轮范围内未发现尚未处理的明确阻断性问题。

**这只是静态审查结论，不是“确认运行无误”。** 按要求未安装依赖、未执行准备脚本、类型检查、编译、lint、格式化命令或测试，未新增测试文件，也未执行 Git 命令。新版 Google/OpenAI 补丁产物仍不在本地 patches 目录，最终效果仍依赖之前提供的依赖准备流程。不能声明可构建、服务端全部接受或严格零回归。

下面 F01–F07 和生命周期修复内容是历史记录；当前以本节及更新后的使用文档为准。

### 实现范围

本轮修改 13 个应用源码文件、1 个工作流文件（仅附件清单）以及 3 份既有文档，没有新增运行时文件。

```text
src/renderer/src/types/modelProfile.ts
src/renderer/src/config/modelProfiles.ts
src/renderer/src/aiCore/plugins/modelProfilePlugin.ts
src/renderer/src/pages/settings/ProviderSettings/EditModelPopup/ModelProfileEditor.tsx
src/renderer/src/utils/assistant.ts
src/renderer/src/aiCore/prepareParams/modelCapabilities.ts
src/renderer/src/pages/home/Inputbar/Inputbar.tsx
src/renderer/src/services/ApiService.ts
src/renderer/src/aiCore/plugins/PluginBuilder.ts
src/renderer/src/aiCore/prepareParams/messageConverter.ts
src/renderer/src/pages/settings/AssistantSettings/AssistantModelSettings.tsx
src/renderer/src/aiCore/provider/providerConfig.ts
src/renderer/src/aiCore/AiProvider.ts
.github/workflows/build-custom.yml
```

累计文件清单见 model-adaptation-files.txt（36 个源码/构建文件及 3 份文档），是人工维护清单，不是 git diff 统计。没有改动依赖版本、锁文件或 SDK 补丁生成脚本。

### 规划与实现记录

1. 读取仓库约定、现有说明、清单、Schema、模板、编辑器、请求插件，确认本轮是现有工作树上的增量修改。
2. 对照固定版本 OpenAI/Anthropic/Google/compatible SDK 的选项与工具实现及 AI SDK Output 实现，不复制任意原始 HTTP 字段到 providerOptions。
3. 保留基础模板，新增完整候选与 plain 模板；思考模式各自独立，max 使用原有 auto 槽位，UI 标签与实际参数对应。
4. 增加 vision/functionCalling，接通普通聊天附件、消息转换、MCP 判断及原生/提示词工具分支；不改全局 isVisionModel/isFunctionCallingModel 或 Agent 后端。
5. generation 在标准参数层合并，继承前轮采样最后过滤及命名空间绕过防护；增加输出格式和现有原生工具参数。
6. 增加官方一级选项名校验、工具参数 strict Schema、协议组合及有效工具选择校验；compatible 扩展继续受身份/标准字段保护。
7. 修改后核查入口到响应的纵向链路，并修复下述审查发现，再更新说明和附件清单。

### 前后端逐项复核

| 项目 | 静态核查 |
| --- | --- |
| 存储 | 仍按渠道+真实 ID 存储，字段 optional；未配置档不进入插件 |
| 模板 | full=false 保留基础三档；full=true 最大七个持久化槽位；载入不保存 |
| 删除语义 | 删除档位移除 UI；删除原生工具默认 off；能力 override 缺失走原判断，false 禁用 |
| 图片 | Inputbar 订阅 providers；ImageBlock 和 FilePart 两条转换均读取显式 vision |
| 函数调用 | MCP 可见性/获取与 API 原生分支使用同一能力；末端拒绝 functionCalling=false 却存在函数工具 |
| Session | Inputbar 显式不读取能力档视觉覆盖；没有改全局视觉/函数模型识别，主进程不变 |
| 通用参数 | 自定义顶层 > 调用/助手 > generation；禁用的采样最终为 undefined；范围/协议验证在合并后再次执行 |
| 结构化输出 | 使用 Output.json/object，而非 providerOptions 塞 response_format；compatible 工厂也启用 Schema 支持 |
| 辅助请求 | 用 callType=chat，而非 topicId，避免标题总结被强制为 JSON 或强制调用工具 |
| 响应文本 | JSON 模式跳过链接 Markdown 转换及文本 think 标签提取；来源事件仍由原适配器接收 |
| 工具参数 | 使用协议对应工具工厂；显式参数整体覆盖默认，空对象有效；不支持的工具字段保存/请求时报错 |
| 工具选择 | 强制工具须在当前请求可用；none 真正移除声明；Gemini 不允许强制内置 Search/URL Context |
| 并行 | OpenAI camelCase、compatible snake_case、Anthropic 反向布尔映射；Gemini 禁止配置不存在的开关 |
| 认证和 ID | 沿用现有 API Key/地址处理，不从模板读取凭据或替换实际 model |
| 交付清单 | 新涉及的五个既有文件纳入清单和工作流完整源码附件 |

### 审查中发现并修复

- **未知 ID 被误转提示词工具模式**：ApiService 的 fallback 原先再次使用旧模型识别，改为与 MCP 获取一致的 isSupportedToolUse。
- **图片 UI 生效但 ImageBlock 被丢弃**：messageConverter 的总入口仍用旧 isVisionModel，改用已支持能力档的 supportsImageInput。
- **旧图片生成名称影响能力档请求**：显式聊天能力档不再被 ApiService 按名字分流到专用图像生成；输入附件判断也不会因旧图像生成名单绕过 vision=false。
- **compatible 结构化输出只降级为 json_object**：已在 providerSettings 设置 supportsStructuredOutputs，只有显式 json-schema 才启用。
- **标题总结也携带 topicId**：输出配置与工具选择改用 callType 识别，避免破坏辅助功能的文本契约。
- **JSON 内容被改写**：跳过搜索链接 Markdown 替换和 think 标签提取，避免合法 JSON 字符串被文本插件处理。
- **Google 原生-only 分支忽略 toolChoice**：none 在插件中移除工具；required/指定工具只允许实际函数工具，不承诺可以强制原生搜索。
- **全局黑名单与用户白名单冲突**：显式 webSearchOptions 不与全局默认递归合并。
- **通用参数或工具选项静默丢弃**：封闭新增标准字段的 snake_case 绕过；按协议拒绝不能序列化的标准参数和未知工具参数。
- **默认采样值与助手开关关系不透明**：助手设置额外展示 generation 默认值、覆盖顺序和完全禁用方法。
- **强制工具与 thinking 冲突**：Anthropic thinking 的强制选择在配置及请求阶段检查；提示词 MCP 与 JSON 输出组合明确报错。

以上是源码静态推演，不是执行过的用例。

### 不能由本轮推导出的能力

- 不是所有官方 API 字段或平台工具都已实现。没有新增 File Search、Code Execution、Computer Use、Shell、音视频、Files API、WebSocket 或历史状态恢复。
- 视觉/函数覆盖作用于普通助手聊天；模型列表旧图标不等于能力档状态，也未承诺全部独立窗口和 Agent 入口同步。
- options 一级字段已校验，但没有复制上游所有深层 Schema。值/嵌套字段由 SDK 继续检查，SDK 警告仍须关注。
- 部分 SDK 型号约束仍存在（服务等级、思考模式等）。本轮未扩大 SDK 补丁，不声称任意参数在任意渠道别名下必定原样发送。
- JSON Schema 根类型和配置结构有校验，但没有完整的本地 JSON Schema 验证器；JSON 结果按文本展示，不声明最终对象已经客户端完整验证。
- 全量候选档位不代表单个模型支持；需用户裁剪。服务端是否实现声明的能力，此信息我无法确认，建议交叉验证。
- 新 strict 规则会拒绝旧配置中的未实现字段；这是为了避免静默失效的有意行为变化。未配置模型的旧选项处理不变。
- 原有跨轮 reasoning signature / encrypted content / phase / 工具历史限制保持不变。
- 新文案使用 i18next 中文 defaultValue；未执行全语言资源和格式检查。

### 本轮读取的主要上游实现

- https://unpkg.com/@ai-sdk/openai@3.0.131/src/chat/openai-chat-options.ts
- https://unpkg.com/@ai-sdk/openai@3.0.131/src/responses/openai-responses-options.ts
- https://unpkg.com/@ai-sdk/openai@3.0.131/src/tool/web-search.ts
- https://unpkg.com/@ai-sdk/anthropic@3.0.135/src/anthropic-messages-options.ts
- https://unpkg.com/@ai-sdk/anthropic@3.0.135/src/tool/web-search_20250305.ts
- https://unpkg.com/@ai-sdk/anthropic@3.0.135/src/tool/web-fetch-20250910.ts
- https://unpkg.com/@ai-sdk/google@3.0.138/src/google-generative-ai-options.ts
- https://unpkg.com/@ai-sdk/google@3.0.138/src/google-generative-ai-language-model.ts
- https://unpkg.com/@ai-sdk/google@3.0.138/src/google-prepare-tools.ts
- https://unpkg.com/@ai-sdk/google@3.0.138/src/tool/google-search.ts
- https://unpkg.com/@ai-sdk/google@3.0.138/src/tool/url-context.ts
- https://unpkg.com/@ai-sdk/openai-compatible@2.0.87/src/openai-compatible-provider.ts
- https://unpkg.com/@ai-sdk/openai-compatible@2.0.87/src/chat/openai-compatible-chat-language-model.ts
- https://unpkg.com/ai@6.0.315/src/generate-text/output.ts

## 历史记录：F01–F07 修复与人工静态复审

## 结论与验证等级

本轮已在现有模型能力档实现上修正 F01–F07 对应的应用代码和 SDK 补丁生成逻辑。按下述范围回读源码及调用链后，未发现这些修复内尚未处理的明确阻断性问题。

这不是构建通过、服务端兼容通过或零回归证明：

- 未安装依赖，未执行准备脚本、编译、类型检查、lint、格式化命令或测试。
- 未新增测试文件，未执行 Git 提交、推送或 Git 差异命令。
- 本地尚无新版 Google/OpenAI 补丁产物；锁文件尚未更新到新依赖清单。
- F02 的 SDK 工具覆盖、F03 的路径兼容、F06 的末端采样覆盖，要在准备脚本生成并安装补丁后才真正生效。
- SDK 打包产物的 AST 匹配数量及 pnpm 别名补丁注册尚待实际验证。不能将脚本已保存说成 SDK 已打补丁。

本报告替代上一版笼统的静态审查结论；既有多轮历史、依赖准备和服务端能力限制仍然保留。

## 执行与审查范围

1. 重新读取 AGENTS.md/CLAUDE.md、修改清单、已有说明与审查记录。遵循私人 Fork 当前任务的要求，不执行上游要求的测试/构建命令。
2. 完整读取本轮修改的源码文件；追踪配置 Schema、参数分类、协议工厂、插件顺序、思考菜单、助手设置和文件处理链路。
3. 对照固定版本 OpenAI Chat/Responses 主实现、compatible 主实现与消息转换、Google 路径函数、OpenAI internal 导出和包入口。
4. 对实际触发条件分别采用最小修复，不新增模型版本正则，不伪造真实 ID，不重写主进程或历史消息系统。
5. 修改后回读核心完整文件、核对逐文件编辑差异和关联调用；检查 UI/API 参数命名、布尔值语义、导出、旧分支和构建附件。
6. 更新使用说明、完整源码文件清单及本报告。

本轮修改 13 个源码/构建文件、3 份现有文档，没有新增运行时文件：

```text
.github/workflows/build-custom.yml
scripts/prepare-model-sdk.cjs
src/renderer/src/types/modelProfile.ts
src/renderer/src/aiCore/plugins/modelProfilePlugin.ts
src/renderer/src/config/models/reasoning.ts
src/renderer/src/pages/home/Inputbar/tools/thinkingTool.tsx
src/renderer/src/pages/home/Inputbar/tools/components/ThinkingButton.tsx
src/renderer/src/hooks/useAssistant.ts
src/renderer/src/pages/settings/AssistantSettings/AssistantModelSettings.tsx
src/renderer/src/pages/settings/ProviderSettings/EditModelPopup/ModelProfileEditor.tsx
src/renderer/src/aiCore/plugins/pdfCompatibilityPlugin.ts
src/renderer/src/aiCore/prepareParams/modelCapabilities.ts
src/renderer/src/aiCore/prepareParams/fileProcessor.ts
docs/zh/guides/model-adaptation.md
docs/zh/guides/model-adaptation-files.txt
docs/zh/guides/model-adaptation-review.md
```

项目累计适配文件清单为 31 个源码/构建文件及 3 份文档。它是人工维护的交付清单，不是本次执行 Git 得到的差异统计。

## F01：命名空间内标准参数绕过约束

**修复位置：** modelProfilePlugin.ts 的 transformParams。

展开当前协议命名空间后，用原有 isAiSdkParam 判定标准参数。命名空间中的 temperature/topP/topK/maxOutputTokens 等会报错，要求移到顶层；不再写入 providerOptions。snake_case 的受控字段仍沿用原冲突检查。

顶层参数继续经 extractAiSdkStandardParams 进入标准设置，然后执行能力档采样过滤。禁用时仍显式写入 undefined，防止 PluginManager 浅合并恢复旧字段。

**静态推演：** compatible + sampling.temperature=false + openaiCompatible.temperature=0.7，在 SDK 调用前报错；同值位于顶层时经标准过滤被省略。非标准且不冲突的渠道参数仍按原逻辑合并。

**结论：** 报告中的命名空间绕过路径已封闭，不改变未配置模型的自定义参数处理。

## F02：Gemini 工具与 SDK 能力声明不一致

**修复位置：** modelProfileSchema.superRefine。

Gemini 声明任一原生工具或 mixed=true 时，必须存在 googleCapabilities。原有交叉校验继续要求：

- Search/URL Context：supportsGemini2Tools=true；
- 混合原生/函数工具：usesGemini3Features=true。

编辑器保存和请求插件构造均调用同一 Schema。对历史已保存的不完整配置，请求会明确失败，要求修正；不会继续悄悄交由 SDK 按别名猜测。

**静态推演：** route-a 配置搜索但省略 googleCapabilities 会被拒绝；补全正确布尔值后，插件会向 google 命名空间写入内部覆盖，补丁在消息及工具准备两处消费。

**结论：** 应用层校验已修复；最终工具序列化依赖尚未实际生成的 Google 补丁。没有自动断言服务端支持。

## F03：带斜杠 Gemini 渠道 ID 的资源路径

**修复位置：** prepare-model-sdk.cjs 中 Google getModelPath 的定版本 AST 修改。

保留原版 includes("models/") 的路径规则，并保留 tunedModels/、publishers/、projects/ 资源前缀；其余模型 ID 即使带斜杠也添加 models/。不修改 this.modelId、模型配置或响应身份。

**静态推演：**

| 输入 ID | 路径 |
| --- | --- |
| route-a | models/route-a |
| vendor/route-a | models/vendor/route-a |
| models/route-a | 原样 |
| vendor/models/route-a | 原样，与原补丁一致 |
| tunedModels/route-a | 原样 |
| projects/p/locations/l/publishers/google/models/m | 原样 |

**结论：** 修复逻辑已写入准备脚本；未生成/应用补丁，不能声称已经观察到正确的 HTTP URL。特殊渠道资源格式仍需核对。

## F04：聊天能力档影响 Agent Session 思考入口

**修复位置：** reasoning.ts、thinkingTool.tsx、ThinkingButton.tsx、useAssistant.ts。

抽出原有推理判断主体，供 Session 直接使用，不复制模型正则。Session 的显示条件和固定推理判断使用 builtin 规则；菜单继续使用原版模型类型列表。普通聊天仍按能力档处理。

Session 没有显式 effort 时传 default，确保走受控模式，避免误落入普通助手设置。受控按钮调用 useAssistant 时禁用思考设置同步 effect；点击只调用 Session 回调。

**静态推演：** 同一模型配置 reasoning=[] 不再让 Session 按钮消失；聊天能力档有自定义选项也不会注入 Session 菜单。受控按钮不写普通助手 effort。

**结论：** 报告涉及的 Session 思考入口已隔离。没有修改主进程 Agent 请求、认证或数据库，也没有宣称已适配 Agent 新模型能力。

## F05：采样设置 UI 与发送状态不一致

**修复位置：** AssistantModelSettings.tsx。

按发送链相同的模型优先级（assistant.model → assistant.defaultModel → 全局默认）选择能力档，并订阅当前 Provider 配置。能力档禁止温度/Top P 时，开关置灰、显示关闭，不展示可编辑数值；保存值保留，切换模型可恢复。

信息栏列出被禁用的 temperature/topP/topK、当前模型、默认输出值及覆盖优先级。最大输出优先级说明与请求一致：顶层自定义 maxOutputTokens → 已开启的助手限制 → 能力档默认值；Anthropic 兜底 16384。

**结论：** 能力档导致的静默 UI/发送分歧已修复。未配置档时控件状态及原 onChange 逻辑不变；未新增全局 Top K 控件。

## F06：OpenAI 模型名规则丢弃显式采样参数

**修复位置：** modelProfilePlugin.ts、prepare-model-sdk.cjs、modelProfile.ts、build-custom.yml。

对 official Chat 和 Responses，插件把 profile.sampling 写入内部 cherryModelCapabilities。新版 OpenAI 补丁仅在删除 temperature/top_p 的条件处增加显式覆盖判断：配置 true 时不删除，缺省则保留上游行为；配置 false 已由插件省略标准值。

补丁范围不包括 reasoningEffort 的合法值列表、system role、Token 字段、logprobs、service tier 等，不通过 forceReasoning=false 伪装非推理模型。内部字段只在原始 providerOptions 中被补丁读取，OpenAI 请求体采用显式字段序列化，不发送该控制对象。compatible 不注入此对象，避免它被透传。

OpenAI 各选定适配器不序列化标准 topK，现于 Schema 拒绝开启，避免展示为支持。

**静态推演：** official + route-a + reasoningEffort=none + temperature允许，末端不再因 ID 未匹配而删除温度；temperature不允许时顶层值仍为 undefined；没有内部声明的其他使用者保留 SDK 原过滤。

**结论：** 采样覆盖代码与生成脚本已修正；实际补丁应用未验证。sampling=true 是用户对服务端能力的声明，不会验证每个思考档位与采样参数的兼容性，请勿将不支持的组合配置为允许。其他 OpenAI 名称判断不在本次 F06 采样修复范围。

## F07：协议切换后文件转换仍走旧类型

**修复位置：** pdfCompatibilityPlugin.ts、modelCapabilities.ts、fileProcessor.ts、modelProfile.ts、配置编辑器说明。

- 原生 PDF 判断优先读取能力档；可用 nativePdf 显式覆盖。
- 未填 nativePdf：Gemini/Anthropic/Responses 原生 PDF；Chat 默认文本提取，确认渠道支持后可显式开启。
- 文件大小判断读取有效协议，沿用原有阈值；Anthropic 的 image/jpg 规范化也读取有效协议。
- 能力档不自动继承旧渠道的 Files API：支持判断和路由都明确禁止跨协议上传，避免向错误端点上传或复用不兼容远程 ID。
- 大 PDF 保留原有大小警告和文本回退。配置界面及文档说明了该限制；未配置模型的上传分支保留。

**静态推演：** openai 渠道 + Gemini 能力档 + 小 PDF，保留 FilePart 不再被旧 openai 判断转文本；nativePdf=false 明确提取文本；超限 PDF 不向旧 Files API 发上传请求。

**结论：** 所选协议与内联 PDF 处理已一致，错误上传路径已隔离。这里采用受限内联文件支持，不是实现全套跨协议 Files API，也不承诺大文件保留扫描图和版面。

## 回归边界复核

- 无能力档：原供应商、采样函数、PDF/上传规则、思考菜单规则继续走原分支。
- 本轮没有改动 package.json 版本声明、锁文件、数据库 schema、主进程、Agent、认证、图像生成或响应块持久化。
- 新版 SDK 补丁作用于固定版本；旧版 Google 3.0.64/OpenAI 3.0.53 补丁不删除、不覆盖。
- 新 OpenAI 采样控制不改变请求模型 ID；Google 只规范资源路径。
- 新校验会拒绝此前可保存但无法兑现的能力组合，这是本轮有意的行为修正。
- 准备脚本检查两个 SDK 版本、修订标记与 AST 匹配数量；Actions 两份补丁附件及新改动源文件已经纳入清单。

## 尚未验证与仍然存在的限制

1. 锁文件/补丁准备和冻结安装没有执行；SDK public/internal、ESM/CommonJS 打包产物的实际匹配还需 CI 确认。
2. 共享 ai/provider/provider-utils/Zod 的升级来自前一轮；供应商别名并存不等于这些公共依赖完全没有回归风险。
3. 历史持久化仍未完整保存 Anthropic signature、Responses encrypted reasoning/phase、所有工具调用与结果。此次不扩展该业务范围。
4. 模型能力需要显式配置，不是自动发现所有未来系列。任意渠道/型号是否真实支持声明的参数，此信息我无法确认，建议交叉验证。
5. SDK 仍不是任意 JSON 透传；非本次修复字段可能被上游校验、忽略或修正，warning 只能辅助诊断。
6. 新交互文案使用 i18next 中文 defaultValue，未生成全语言资源，也未执行国际化或格式检查。

## 后续交付前置条件

优先由 GitHub Actions 准备依赖，不要求本地配置开发工具链。如自愿在现有 Node/pnpm 环境准备，可运行以下命令；脚本现在统一跳过生命周期，详见文末补充审查：

```bash
node scripts/prepare-model-sdk.cjs --prepare
```

检查生成的 package.json、pnpm-workspace.yaml、pnpm-lock.yaml，以及：

```text
patches/@ai-sdk__google@3.0.138.patch
patches/@ai-sdk__openai@3.0.131.patch
```

两份生成补丁都应包含 revision 2 标记。仅有旧版 Google 能力补丁不够。完成生成文件审查后，再按用户计划做唯一一次最终提交。本次未替用户执行上述命令。

## 本轮 SDK 源码核查依据

- https://unpkg.com/@ai-sdk/openai@3.0.131/src/chat/openai-chat-language-model.ts
- https://unpkg.com/@ai-sdk/openai@3.0.131/src/responses/openai-responses-language-model.ts
- https://unpkg.com/@ai-sdk/openai@3.0.131/src/internal/index.ts
- https://unpkg.com/@ai-sdk/openai@3.0.131/package.json
- https://unpkg.com/@ai-sdk/openai-compatible@2.0.87/src/chat/openai-compatible-chat-language-model.ts
- https://unpkg.com/@ai-sdk/openai-compatible@2.0.87/src/chat/convert-to-openai-compatible-chat-messages.ts
- https://unpkg.com/@ai-sdk/google@3.0.138/src/get-model-path.ts

以上是固定版本实现依据，不是任意型号/渠道兼容性实测结果。

## 补充修复：依赖准备与正式安装隔离

### 触发问题

用户实际运行准备脚本后，首次安装执行了 `@paymoapp/electron-shutdown-handler` 的 install 生命周期。预编译二进制不可用后转为 node-gyp，本地未找到 Visual Studio C++ 工具链，准备在生成 SDK 补丁之前停止。此前“未执行准备脚本”指助手的操作记录；该失败是用户随后提供的执行日志，不应混同。

这暴露出准备流程没有隔离依赖生命周期的问题，不要求用户为生成补丁/锁文件配置本地原生开发环境。

### 修改范围

仅修改以下四个已有文件：

- scripts/prepare-model-sdk.cjs
- .github/workflows/build-custom.yml
- docs/zh/guides/model-adaptation.md
- docs/zh/guides/model-adaptation-review.md

未改模型适配源码、SDK AST 补丁内容/修订标记、package.json、pnpm-workspace.yaml、锁文件或旧补丁；未创建测试或其他运行时文件。

### 修复与静态审查

1. 所有 pnpm 调用统一经过脚本的同一个执行函数，命令行强制 `--config.ignore-scripts=true`，并通过 spawnSync 的 env 参数向子进程传入 `npm_config_ignore_scripts=true`。
2. 首次安装、patch、patch-commit 内部安装、最终冻结安装以及已有补丁的快速路径全部覆盖；没有遗漏原来使用可变参数的调用点。
3. 在修改依赖前读取并核对实际 pnpm 版本与 packageManager 声明，当前要求 10.27.0；版本不符停止，不自动迁移配置或升级包管理器。该检查不等于已排除所有外层启动器警告。
4. 脚本不修改 process.env、用户 .npmrc 或 Actions 的 GITHUB_ENV，准备阶段的禁用设置不泄漏到正式安装。准备输出明确提示依赖生命周期尚未执行。
5. 工作流先完成准备及附件上传；仅非 dependencies_only 运行才执行 `pnpm --config.ignore-scripts=false install --frozen-lockfile`。
6. 正常安装后执行 `pnpm --config.ignore-scripts=false --config.include-workspace-root=true -r rebuild --pending`，覆盖已安装但跳过构建的 workspace/root 依赖；保留项目 onlyBuiltDependencies，未开启任意依赖构建权限。
7. 两条正式安装命令都位于应用 build 之前；shell 错误不被吞掉，失败不继续打包。dependencies_only 会跳过正常安装、pending rebuild、应用 build、打包和安装包上传。
8. pnpm 子命令退出码仍严格检查。原有 SDK 版本、补丁修订、AST 匹配数量及注册验证没有删除或放宽。

**静态结论：** 已封闭本次日志暴露的“准备阶段触发本地原生编译”调用路径，并明确分离正式构建的依赖安装。回读本轮完整修改文件后，未发现此修复范围内尚未处理的明确阻断性问题。

**验证边界：** 本轮仅文件读写与人工静态审查，没有安装依赖、执行准备脚本、编译、类型检查、格式化、测试或 Git 命令。没有验证实际 SDK 补丁生成、pnpm 冻结安装或云端原生模块构建成功。补丁产物和锁文件仍应以之后 Actions 的结果为准；发生云端原生构建问题时在 runner 排查，不转而要求本地配置 C++ 工具链。

### pnpm 10.27.0 源码核对依据

- patch-commit 将 opts 传给 install.handler（包括 ignoreScripts）：https://github.com/pnpm/pnpm/blob/v10.27.0/patching/plugin-commands-patching/src/patchCommit.ts
- rebuild --pending 用于安装时被 ignore-scripts 跳过的依赖：https://github.com/pnpm/pnpm/blob/v10.27.0/exec/plugin-commands-rebuild/src/rebuild.ts
- pendingBuilds、构建白名单及项目生命周期处理：https://github.com/pnpm/pnpm/blob/v10.27.0/exec/plugin-commands-rebuild/src/implementation/index.ts
- workspace rebuild 与根项目配置：https://github.com/pnpm/pnpm/blob/v10.27.0/exec/plugin-commands-rebuild/src/recursive.ts

源码核对用于确认选项与调用关系，不替代运行验证。

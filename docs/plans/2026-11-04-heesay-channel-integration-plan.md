# Open Grind Heesay 渠道接入与架构落地执行文档

> **制定日期**: 2026-11-04  
> **状态**: 已完成 (Completed)  
> **核心渠道支持**: Grindr, Scruff, Jack'd, Heesay

---

## 一、背景与设计原则

Open Grind 已成功将 Grindr、Scruff 与 Jack'd 抽象为统一的多渠道同志社交桌面客户端架构。
本次接入 **Heesay**（前身为 Blued 国际版），遵循 Scruff 与 Jack'd 的优秀实践模式：
1. **中继传输层解耦**：统一通过 OmniRelay (`https://omni-relay.toonhub.top`) 请求上游，携带 `omni-platform: heesay`、`omni-account: {{email}}` 与可选 `omni-proxy`；
2. **领域模型归一化**：将 Heesay 特有的资料结构（`uid`、`city_settled`、`role`、`description`、`tags_oversea`、`album` 等）转换为标准的 `UniversalGridUser`、`UniversalUserProfile` 与 `UniversalConversation`；
3. **多账号与隔离上下文**：支持 Heesay 账号池管理、平台账号与代理自动检索联动、独立会话与消息存储；
4. **统一即时通讯 (IM) 协议**：对接中继 WSS 长链与消息收发流水线；
5. **交互动作规范化**：Heesay 原生交互定义为“打招呼 (Say Hi)”，并在资料卡、Interest 视图中动态响应。

---

## 二、能力对比与中继协议矩阵

| 业务能力 | 中继接口 (Endpoint) | HTTP 方法 | 请求关键参数 / 模板 | 响应核心数据结构 | Heesay 专属适配规则 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **平台账号查询** | `https://omni-api.toonhub.top/platform/accounts/heesay/{{email}}` | `GET` | `accountEmail` | `data.platformUserId`, `data.proxyUrl` | 自动匹配并回填专属代理 |
| **账号池列表** | `https://omni-api.toonhub.top/platform/accounts` | `GET` | `platformName: heesay`, `pageSize: 30` | `data.items[]` | 弹窗一键选号并填充凭证 |
| **附近用户发现** | `{{relayBase}}/users` | `GET` | `longitude`, `latitude`, `start`, `limit: 70`, `sort_by: index_only`, `filters: JSON` | `code: 200`, `data[]` | 步长 70 推进增量分页 |
| **用户主资料** | `{{relayBase}}/users/{{profileId}}` | `GET` | 路径变量 `profileId` | `code: 200`, `data[0]` | 15分钟前端轻量防抖缓存 |
| **用户相册** | `{{relayBase}}/users/{{profileId}}/additional/albums` | `GET` | 路径变量 `profileId` | `data[0].album`, `vice_avatar` | 合并至相册列表 |
| **会话收件箱** | `{{relayBase}}/_private/im/conversations` | `GET` | `platform: heesay`, `user: externalUserId` | `data[]` | 解析双向 partnerId 与最后消息 |
| **单会话消息历史** | `{{relayBase}}/_private/im/messages` | `GET` | `platform: heesay`, `conversationId`, `size: 50` | `ret: true`, `data[]` | 双向消息时间线反序列化 |
| **私信消息发送** | `wss://omni-relay.toonhub.top/_private/im/ws` | `WS` | 统一 `messageSend` 报文 | `messageSend` ACK | 优先 WebSocket，降级 HTTP 乐观状态 |
| **打招呼 (Say Hi)** | `HeesayProvider.sendInteraction` | `Action` | 发送 "Hi" 打招呼私信 | `UniversalInteractionResult` | 交互标识 `say_hi`，文案“打招呼 (Say Hi)” |

---

## 三、修改清单与代码架构

1. **类型与元数据 (`src/lib/channel/types.ts`)**
   - 扩展 `SocialChannelType` 加入 `"heesay"`；
   - 注册 `CHANNEL_METAS.heesay`：品牌色 `#0066ff`，交互动作 `SayHi`，图标 `ChatCircleDots`；
   - 扩展 `UniversalInteractionResult.interactionType` 支持 `"say_hi" | "hi"`。

2. **中继客户端网关 (`src/lib/channel/scruff-protocol/relay-client.ts`)**
   - 适配 `platform: "scruff" | "jackd" | "heesay"`；
   - 扩展响应成功规则，同时兼容 `ret: true` 与 `code: 200 / 0`。

3. **代理与平台账号辅助 (`src/lib/channel/scruff-protocol/proxy-helper.ts`)**
   - 支持 `queryPlatformAccount("heesay", ...)`。

4. **IM WebSocket 长链客户端 (`src/lib/channel/scruff-protocol/relay-im-ws.svelte.ts`)**
   - 允许 `heesay` 渠道建立长连接与接收推流通知。

5. **Heesay 资料解析器 (`src/lib/channel/heesay-protocol/heesay-profile-parser.ts`)**
   - 解析 UID、昵称、头像、副头像、相册、身高（cm）、体重（kg）、角色偏好（1号/0号/0.5/保密）、城市与标签。

6. **Heesay 账号校验与资料同步 (`src/lib/channel/heesay-protocol/heesay-account-verifier.ts`)**
   - `verifyHeesayAccount` 与 `syncHeesayAccountProfile`。

7. **Heesay 渠道 Provider (`src/lib/channel/providers/heesay-provider.ts`)**
   - 实现 `SocialChannelProvider` 接口全量方法。

8. **全局状态机与消息工作台**
   - `channel-state.svelte.ts`: 注册 `HeesayProvider`，初始化与持久化 Heesay 账号列表；
   - `channel-chat-state.svelte.ts`: 消息推流放行 `heesay` 渠道；
   - `template-state.svelte.ts` & `default-templates.ts`: 加入 Heesay 预置打招呼模板。

9. **UI 视图组件适配**
   - `ChannelAccountsDialog.svelte`: 标签栏升级为 5 渠道自适应网格，增加 Heesay 账号池与添加表单；
   - `AddAccountForm.svelte`: 支持从 Heesay 平台账号库挑选并自动填充；
   - `UniversalProfileDialog.svelte`: 针对 Heesay 展示“打招呼 (Say Hi)”交互按钮；
   - `ChannelInterestInteractionsPane.svelte` & `tabs.ts`: Interest 页面第二个 tab 动态显示 `SayHi`；
   - `NetworkLoggerView.svelte`: 增加 Heesay 过滤器；
   - `tauri.conf.json`: CSP 允许 `https://*.bldimg.com` 媒体资源加载。

---

## 四、验证结果

1. **单元测试 (`bun run test:unit src/lib/channel`)**
   - 11 个测试套件，63 项测试全部通过（通过率 100%）。
2. **类型检查 (`bun run check`)**
   - Svelte-check 发现 0 errors, 0 warnings。

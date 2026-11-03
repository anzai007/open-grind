import { beforeEach, describe, expect, it, vi } from "vitest";

import { channelChatState } from "./channel-chat-state.svelte";
import { channelState } from "./channel-state.svelte";

describe("ChannelChatState", () => {
	beforeEach(() => {
		channelChatState.clear();
		channelState.switchChannel("scruff");
	});

	it("initializes with empty state", () => {
		expect(channelChatState.conversations).toHaveLength(0);
		expect(channelChatState.activeConversationId).toBeNull();
		expect(channelChatState.activeConversation).toBeNull();
		expect(channelChatState.messages).toHaveLength(0);
		expect(channelChatState.isLoadingConversations).toBe(false);
	});

	it("opens chat with user and creates conversation if not exists", () => {
		channelChatState.openChatWithUser({
			id: "998877",
			displayName: "Buddy",
			avatarThumbnailUrl: "https://example.com/avatar.jpg",
		});

		expect(channelChatState.activeConversationId).toBe("998877");
		expect(channelChatState.conversations).toHaveLength(1);
		expect(channelChatState.activeConversation?.targetUserName).toBe(
			"Buddy",
		);
	});

	it("optimistically adds message on sendMessage", async () => {
		channelChatState.openChatWithUser({
			id: "998877",
			displayName: "Buddy",
		});

		const currentProvider = channelState.currentProvider;
		vi.spyOn(currentProvider, "sendMessage").mockResolvedValue({
			channel: "scruff",
			conversationId: "998877",
			id: "server-id-123",
			isFromMe: true,
			recipientId: "998877",
			senderId: "me",
			status: "sent",
			text: "Hello there!",
			timestamp: Date.now(),
		});

		const res = await channelChatState.sendMessage("Hello there!");

		expect(res).not.toBeNull();
		expect(channelChatState.messages).toHaveLength(1);
		expect(channelChatState.messages[0]!.text).toBe("Hello there!");
		expect(channelChatState.messages[0]!.status).toBe("sent");
		expect(channelChatState.activeConversation?.lastMessageText).toBe(
			"Hello there!",
		);
	});

	it("preserves active draft conversation when loadConversations resolves with empty server items", async () => {
		// 用户在个人资料弹窗点击“发私信”，openChatWithUser 立即创建草稿并选中
		channelChatState.openChatWithUser({
			id: "user-target-888",
			displayName: "Tom",
			avatarThumbnailUrl: "https://example.com/tom.jpg",
		});

		expect(channelChatState.conversations).toHaveLength(1);
		expect(channelChatState.activeConversationId).toBe("user-target-888");

		// 路由进入 /chat 后，组件挂载触发 loadConversations()
		const currentProvider = channelState.currentProvider;
		vi.spyOn(currentProvider, "getConversations").mockResolvedValue({
			hasNext: false,
			items: [
				{
					channel: "scruff",
					conversationId: "other-user-999",
					lastMessageText: "Old message",
					lastMessageTimestamp: 1000,
					targetUserId: "other-user-999",
					targetUserName: "Old Friend",
					unreadCount: 0,
				},
			],
			offset: 0,
			total: 1,
		});

		await channelChatState.loadConversations();

		// 验证：服务端返回的列表中没有 user-target-888，但本地草稿被完整保留在列表最前，未被抹去（彻底修复 1 秒后消失的问题）
		expect(channelChatState.conversations).toHaveLength(2);
		expect(channelChatState.conversations[0]!.targetUserId).toBe(
			"user-target-888",
		);
		expect(channelChatState.conversations[0]!.targetUserName).toBe("Tom");
		expect(channelChatState.activeConversationId).toBe("user-target-888");
		expect(channelChatState.activeConversation).not.toBeNull();
	});

	it("retains sent messages when re-selecting conversation even if server returns empty messages", async () => {
		channelChatState.openChatWithUser({
			id: "user-persistent-123",
			displayName: "Persistent User",
		});

		const currentProvider = channelState.currentProvider;
		vi.spyOn(currentProvider, "sendMessage").mockResolvedValue({
			channel: "scruff",
			conversationId: "user-persistent-123",
			id: "sent-msg-1",
			isFromMe: true,
			recipientId: "user-persistent-123",
			senderId: "me",
			status: "sent",
			text: "I sent this message",
			timestamp: Date.now(),
		});

		await channelChatState.sendMessage("I sent this message");
		expect(channelChatState.messages).toHaveLength(1);
		expect(channelChatState.messages[0]!.text).toBe("I sent this message");

		// 模拟切出该会话（切换页面）
		channelChatState.activeConversationId = null;
		channelChatState.messages = [];

		// 模拟服务端接口返回空列表（Scruff 典型场景）
		vi.spyOn(currentProvider, "getMessages").mockResolvedValue([]);

		// 模拟用户从其他页面切回并重新点击进入该会话
		await channelChatState.selectConversation("user-persistent-123");

		// 验证：消息未丢失，依然完整展示
		expect(channelChatState.messages).toHaveLength(1);
		expect(channelChatState.messages[0]!.text).toBe("I sent this message");
		expect(channelChatState.messages[0]!.status).toBe("sent");
	});

	it("isolates conversations between channels", () => {
		// Scruff 渠道添加会话
		channelState.switchChannel("scruff");
		channelChatState.switchScope();
		channelChatState.openChatWithUser({
			id: "scruff-user-1",
			displayName: "Scruff Guy",
		});

		expect(channelChatState.conversations).toHaveLength(1);
		expect(channelChatState.conversations[0]!.targetUserId).toBe(
			"scruff-user-1",
		);

		// 切换至 Jack'd 渠道
		channelState.switchChannel("jackd");
		channelChatState.switchScope();

		// Jack'd 渠道应当独立隔离，初始为空
		expect(channelChatState.conversations).toHaveLength(0);

		// Jack'd 渠道新增联系人
		channelChatState.openChatWithUser({
			id: "jackd-user-1",
			displayName: "Jackd Guy",
		});
		expect(channelChatState.conversations).toHaveLength(1);
		expect(channelChatState.conversations[0]!.targetUserId).toBe(
			"jackd-user-1",
		);

		// 切回 Scruff 渠道
		channelState.switchChannel("scruff");
		channelChatState.switchScope();

		// 验证 Scruff 渠道会话完整保留且未被 Jack'd 污染
		expect(channelChatState.conversations).toHaveLength(1);
		expect(channelChatState.conversations[0]!.targetUserId).toBe(
			"scruff-user-1",
		);
	});

	it("preserves hydrated user profile during subsequent loadConversations", async () => {
		const currentProvider = channelState.currentProvider;
		vi.spyOn(currentProvider, "getConversations").mockResolvedValue({
			hasNext: false,
			items: [
				{
					channel: "scruff",
					conversationId: "u202219908",
					lastMessageText: "Hello there",
					lastMessageTimestamp: 1000,
					targetUserId: "202219908",
					targetUserName: "User 202219908",
					unreadCount: 1,
				},
			],
			offset: 0,
			total: 1,
		});

		await channelChatState.loadConversations();
		expect(channelChatState.conversations).toHaveLength(1);

		// 模拟水合更新了真实昵称与头像
		channelChatState.updateConversationUserProfile("202219908", {
			displayName: "Kenji",
			avatarUrl: "https://example.com/kenji.jpg",
		});

		expect(channelChatState.conversations[0]!.targetUserName).toBe("Kenji");
		expect(channelChatState.conversations[0]!.targetAvatarUrl).toBe(
			"https://example.com/kenji.jpg",
		);

		// 再次触发 loadConversations (模拟 5 秒轮询返回未解析的 User 202219908)
		await channelChatState.loadConversations(true);

		// 验证：已水合的真实昵称与头像被完好保留，未被回退成 "User 202219908"
		expect(channelChatState.conversations[0]!.targetUserName).toBe("Kenji");
		expect(channelChatState.conversations[0]!.targetAvatarUrl).toBe(
			"https://example.com/kenji.jpg",
		);
	});

	it("records sent quick DM message and updates lastMessageText without losing message", () => {
		const targetUser = {
			id: "20229988",
			displayName: "TokyoGuy",
			avatarThumbnailUrl: "https://example.com/tokyo.jpg",
		};
		const sentMessage = {
			channel: "scruff" as const,
			conversationId: "20229988",
			id: "msg_sent_1",
			isFromMe: true,
			recipientId: "20229988",
			senderId: "me",
			status: "sent" as const,
			text: "Hi TokyoGuy, nice profile!",
			timestamp: 1700000000000,
		};

		channelChatState.recordSentMessage(targetUser, sentMessage);

		expect(channelChatState.conversations).toHaveLength(1);
		const conv = channelChatState.conversations[0]!;
		expect(conv.targetUserId).toBe("20229988");
		expect(conv.targetUserName).toBe("TokyoGuy");
		expect(conv.targetAvatarUrl).toBe("https://example.com/tokyo.jpg");
		expect(conv.lastMessageText).toBe("Hi TokyoGuy, nice profile!");
		expect(conv.lastMessageTimestamp).toBe(1700000000000);

		// 打开该会话，验证消息流中包含了这条已发送信息
		channelChatState.openChatWithUser(targetUser);
		expect(channelChatState.messages).toHaveLength(1);
		expect(channelChatState.messages[0]!.text).toBe(
			"Hi TokyoGuy, nice profile!",
		);
		expect(channelChatState.messages[0]!.isFromMe).toBe(true);
	});
});

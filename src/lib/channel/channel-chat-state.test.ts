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
});

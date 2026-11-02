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
});

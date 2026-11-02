import { channelState } from "./channel-state.svelte";
import type { UniversalConversation, UniversalMessage } from "./types";

export class ChannelChatState {
	conversations = $state<UniversalConversation[]>([]);
	activeConversationId = $state<string | null>(null);
	messages = $state<UniversalMessage[]>([]);
	isLoadingConversations = $state(false);
	isLoadingMessages = $state(false);
	isSending = $state(false);
	error = $state<string | null>(null);

	get activeConversation(): UniversalConversation | null {
		if (!this.activeConversationId) return null;
		return (
			this.conversations.find(
				(c) => c.conversationId === this.activeConversationId,
			) ?? null
		);
	}

	clear() {
		this.conversations = [];
		this.activeConversationId = null;
		this.messages = [];
		this.isLoadingConversations = false;
		this.isLoadingMessages = false;
		this.isSending = false;
		this.error = null;
	}

	async loadConversations(): Promise<void> {
		const channel = channelState.activeChannel;
		if (channel === "grindr") return;

		this.isLoadingConversations = true;
		this.error = null;

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const res = await provider.getConversations({ account, offset: 0 });
			const serverItems = res.items;

			// 保留本地创建但尚未入库服务端的草稿/新打开会话（避免点击“发私信”后 1 秒被服务器空列表冲掉）
			const localDrafts = this.conversations.filter(
				(local) =>
					!serverItems.some(
						(server) =>
							server.conversationId === local.conversationId ||
							(Boolean(local.targetUserId) &&
								server.targetUserId === local.targetUserId),
					),
			);

			if (localDrafts.length > 0) {
				this.conversations = [...localDrafts, ...serverItems];
			} else {
				this.conversations = serverItems;
			}
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.isLoadingConversations = false;
		}
	}

	async selectConversation(conversationId: string): Promise<void> {
		if (
			this.activeConversationId === conversationId &&
			this.messages.length > 0
		) {
			return;
		}
		this.activeConversationId = conversationId;
		await this.loadMessages(conversationId);
	}

	async loadMessages(conversationId: string): Promise<void> {
		const channel = channelState.activeChannel;
		if (channel === "grindr") return;

		this.isLoadingMessages = true;
		this.error = null;

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const msgs = await provider.getMessages(conversationId, {
				account,
			});
			// 按时间先后升序排列展示聊天流
			this.messages = msgs.sort((a, b) => a.timestamp - b.timestamp);
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.isLoadingMessages = false;
		}
	}

	async sendMessage(text: string): Promise<UniversalMessage | null> {
		const trimmed = text.trim();
		if (!trimmed || !this.activeConversationId || this.isSending) {
			return null;
		}

		const channel = channelState.activeChannel;
		const targetUserId =
			this.activeConversation?.targetUserId || this.activeConversationId;
		const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

		const optimisticMsg: UniversalMessage = {
			channel,
			conversationId: this.activeConversationId,
			id: tempId,
			isFromMe: true,
			recipientId: targetUserId,
			senderId: "me",
			status: "sending",
			text: trimmed,
			timestamp: Date.now(),
		};

		// 乐观更新消息流
		this.messages = [...this.messages, optimisticMsg];
		this.isSending = true;

		// 乐观更新会话列表最后消息
		this.updateConversationLastMessage(this.activeConversationId, trimmed);

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const sent = await provider.sendMessage({
				account,
				conversationId: this.activeConversationId,
				targetUserId,
				text: trimmed,
			});

			// 将 pending 状态替换为已发送真实消息
			this.messages = this.messages.map((m) =>
				m.id === tempId ? { ...sent, status: "sent" } : m,
			);
			return sent;
		} catch (e) {
			this.messages = this.messages.map((m) =>
				m.id === tempId ? { ...m, status: "failed" } : m,
			);
			this.error = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			this.isSending = false;
		}
	}

	openChatWithUser(user: {
		id: string;
		displayName?: string;
		avatarThumbnailUrl?: string;
	}): void {
		const channel = channelState.activeChannel;
		const userIdStr = String(user.id);

		// 查找是否已有该联系人会话
		let conv = this.conversations.find(
			(c) =>
				c.targetUserId === userIdStr || c.conversationId === userIdStr,
		);

		if (!conv) {
			conv = {
				channel,
				conversationId: userIdStr,
				lastMessageText: "",
				lastMessageTimestamp: Date.now(),
				targetAvatarUrl: user.avatarThumbnailUrl,
				targetUserId: userIdStr,
				targetUserName: user.displayName || `User ${userIdStr}`,
				unreadCount: 0,
			};
			this.conversations = [conv, ...this.conversations];
		}

		this.activeConversationId = conv.conversationId;
		void this.loadMessages(conv.conversationId);
	}

	private updateConversationLastMessage(convId: string, text: string) {
		const idx = this.conversations.findIndex(
			(c) => c.conversationId === convId,
		);
		const conv = this.conversations[idx];
		if (conv) {
			const updated: UniversalConversation = {
				...conv,
				lastMessageText: text,
				lastMessageTimestamp: Date.now(),
			};
			const rest = this.conversations.filter((_, i) => i !== idx);
			this.conversations = [updated, ...rest];
		}
	}
}

export const channelChatState = new ChannelChatState();

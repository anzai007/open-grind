import { SvelteMap } from "svelte/reactivity";

import { channelState } from "./channel-state.svelte";
import type { UniversalConversation, UniversalMessage } from "./types";

const STORAGE_KEY = "opengrind_channel_chat_v1";

interface StoredChatPayload {
	conversations: Record<string, UniversalConversation[]>;
	messages: Record<string, UniversalMessage[]>;
}

export class ChannelChatState {
	conversations = $state<UniversalConversation[]>([]);
	activeConversationId = $state<string | null>(null);
	messages = $state<UniversalMessage[]>([]);
	isLoadingConversations = $state(false);
	isLoadingMessages = $state(false);
	isSending = $state(false);
	error = $state<string | null>(null);

	private conversationsStore = new SvelteMap<
		string,
		UniversalConversation[]
	>();
	private messagesStore = new SvelteMap<string, UniversalMessage[]>();
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private isFetchingConversations = false;
	private isFetchingMessages = false;

	constructor() {
		this.loadFromStorage();
	}

	get activeConversation(): UniversalConversation | null {
		if (!this.activeConversationId) return null;
		return (
			this.conversations.find(
				(c) => c.conversationId === this.activeConversationId,
			) ?? null
		);
	}

	private getScopeKey(): string {
		const channel = channelState.activeChannel;
		const accountId = channelState.currentAccount?.id ?? "default";
		return `${channel}:${accountId}`;
	}

	private getMessageScopeKey(conversationId: string): string {
		return `${this.getScopeKey()}:${conversationId}`;
	}

	private loadFromStorage() {
		if (typeof window === "undefined" || !window.localStorage) return;
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as StoredChatPayload;
			if (parsed.conversations) {
				for (const [k, v] of Object.entries(parsed.conversations)) {
					this.conversationsStore.set(k, v);
				}
			}
			if (parsed.messages) {
				for (const [k, v] of Object.entries(parsed.messages)) {
					this.messagesStore.set(k, v);
				}
			}
		} catch {
			// ignore storage errors
		}
	}

	private saveToStorage() {
		if (typeof window === "undefined" || !window.localStorage) return;
		try {
			const payload: StoredChatPayload = {
				conversations: Object.fromEntries(this.conversationsStore),
				messages: Object.fromEntries(this.messagesStore),
			};
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		} catch {
			// ignore storage quota errors
		}
	}

	clear() {
		this.stopPolling();
		this.conversations = [];
		this.activeConversationId = null;
		this.messages = [];
		this.isLoadingConversations = false;
		this.isLoadingMessages = false;
		this.isSending = false;
		this.error = null;
		this.conversationsStore.clear();
		this.messagesStore.clear();
		if (typeof window !== "undefined" && window.localStorage) {
			try {
				window.localStorage.removeItem(STORAGE_KEY);
			} catch {
				// ignore
			}
		}
	}

	startPolling(intervalMs = 5000): void {
		this.stopPolling();
		this.pollingTimer = setInterval(() => {
			if (channelState.activeChannel === "grindr") return;
			void this.loadConversations(true);
			if (this.activeConversationId) {
				void this.loadMessages(this.activeConversationId, true);
			}
		}, intervalMs);
	}

	stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
		}
	}

	switchScope(): void {
		const scope = this.getScopeKey();
		this.conversations = this.conversationsStore.get(scope) ?? [];
		this.activeConversationId = null;
		this.messages = [];
	}

	async loadConversations(silent = false): Promise<void> {
		const channel = channelState.activeChannel;
		if (channel === "grindr") return;
		if (this.isFetchingConversations) return;
		this.isFetchingConversations = true;

		const scope = this.getScopeKey();
		// 先尝试从内存或持久化存储秒级恢复已有会话列表
		if (
			this.conversations.length === 0 &&
			this.conversationsStore.has(scope)
		) {
			this.conversations = this.conversationsStore.get(scope)!;
		}

		if (!silent) {
			this.isLoadingConversations = true;
			this.error = null;
		}

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const res = await provider.getConversations({ account, offset: 0 });
			const serverItems = res.items;

			const localMap = new SvelteMap<string, UniversalConversation>();
			for (const c of this.conversations) {
				localMap.set(c.conversationId, c);
				if (c.targetUserId) localMap.set(c.targetUserId, c);
			}

			// 如果本地有较新的最后消息（例如刚发送完毕），保留本地的更新
			const mergedServerItems = serverItems.map((s) => {
				const local =
					localMap.get(s.conversationId) ||
					(s.targetUserId ? localMap.get(s.targetUserId) : undefined);
				if (
					local &&
					(local.lastMessageTimestamp ?? 0) >
						(s.lastMessageTimestamp ?? 0)
				) {
					return {
						...s,
						lastMessageText:
							local.lastMessageText || s.lastMessageText,
						lastMessageTimestamp: local.lastMessageTimestamp,
					};
				}
				return s;
			});

			// 保留本地创建但尚未入库服务端的草稿/新打开会话（避免点击“发私信”后 1 秒被服务器空列表冲掉）
			const localDrafts = this.conversations.filter(
				(local) =>
					!mergedServerItems.some(
						(server) =>
							server.conversationId === local.conversationId ||
							(Boolean(local.targetUserId) &&
								server.targetUserId === local.targetUserId),
					),
			);

			const combined = [...localDrafts, ...mergedServerItems];
			this.conversations = combined;
			this.conversationsStore.set(scope, combined);
			this.saveToStorage();
		} catch (e) {
			if (!silent) {
				this.error = e instanceof Error ? e.message : String(e);
			}
		} finally {
			this.isFetchingConversations = false;
			if (!silent) {
				this.isLoadingConversations = false;
			}
		}
	}

	async selectConversation(conversationId: string): Promise<void> {
		this.activeConversationId = conversationId;
		const msgScope = this.getMessageScopeKey(conversationId);
		const cachedMsgs = this.messagesStore.get(msgScope);

		// 如果本地已有该会话的历史消息，立刻渲染，杜绝空白并保留所有已发送消息
		if (cachedMsgs && cachedMsgs.length > 0) {
			this.messages = cachedMsgs;
		} else {
			this.messages = [];
		}

		await this.loadMessages(conversationId);
	}

	async loadMessages(conversationId: string, silent = false): Promise<void> {
		const channel = channelState.activeChannel;
		if (channel === "grindr") return;
		if (this.isFetchingMessages) return;
		this.isFetchingMessages = true;

		const msgScope = this.getMessageScopeKey(conversationId);
		if (!silent) {
			this.isLoadingMessages = true;
			this.error = null;
		}

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const remoteMsgs = await provider.getMessages(conversationId, {
				account,
			});

			const localMsgs =
				this.messagesStore.get(msgScope) ?? this.messages ?? [];

			// 合并远程拉取消息与本地缓存消息，防止本地刚发送成功的消息被服务端冲掉
			const mergedMap = new SvelteMap<string, UniversalMessage>();
			for (const lm of localMsgs) {
				mergedMap.set(lm.id, lm);
			}

			for (const rm of remoteMsgs) {
				mergedMap.set(rm.id, rm);

				// 模糊去重：若有同内容同方向同时间的本地草稿，清理临时条目
				for (const [id, lm] of mergedMap.entries()) {
					if (
						id !== rm.id &&
						lm.isFromMe === rm.isFromMe &&
						lm.text === rm.text &&
						Math.abs(lm.timestamp - rm.timestamp) < 10000
					) {
						mergedMap.delete(id);
					}
				}
			}

			const mergedList = Array.from(mergedMap.values()).sort(
				(a, b) => a.timestamp - b.timestamp,
			);

			this.messages = mergedList;
			this.messagesStore.set(msgScope, mergedList);
			this.saveToStorage();
		} catch (e) {
			if (!silent) {
				this.error = e instanceof Error ? e.message : String(e);
			}
		} finally {
			this.isFetchingMessages = false;
			if (!silent) {
				this.isLoadingMessages = false;
			}
		}
	}

	async sendMessage(text: string): Promise<UniversalMessage | null> {
		const trimmed = text.trim();
		if (!this.activeConversationId || this.isSending || !trimmed) {
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
		const msgScope = this.getMessageScopeKey(this.activeConversationId);
		this.messagesStore.set(msgScope, this.messages);
		this.saveToStorage();
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
			this.messagesStore.set(msgScope, this.messages);
			this.saveToStorage();
			return sent;
		} catch (e) {
			this.messages = this.messages.map((m) =>
				m.id === tempId ? { ...m, status: "failed" } : m,
			);
			this.messagesStore.set(msgScope, this.messages);
			this.saveToStorage();
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
		const scope = this.getScopeKey();

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
			this.conversationsStore.set(scope, this.conversations);
			this.saveToStorage();
		}

		this.activeConversationId = conv.conversationId;
		const msgScope = this.getMessageScopeKey(conv.conversationId);
		this.messages = this.messagesStore.get(msgScope) ?? [];
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
			this.conversationsStore.set(this.getScopeKey(), this.conversations);
			this.saveToStorage();
		}
	}
}

export const channelChatState = new ChannelChatState();

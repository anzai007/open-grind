/* eslint-disable max-lines */
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { channelGridState } from "./channel-grid-state.svelte";
import { channelState } from "./channel-state.svelte";
import {
	relayImWs,
	type RelayInboundMessageData,
	type RelayWsPacket,
} from "./scruff-protocol/relay-im-ws.svelte";
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
	private hydratingUserIds = new SvelteSet<string>();

	constructor() {
		this.loadFromStorage();
		// 监听 Scruff / Jack'd 统一 IM WSS 实时推送（来信与发信即时推流至界面）
		relayImWs.onMessage((packet) => {
			this.handleWsPacket(packet);
		});
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

	normalizePartnerId(conversationId: string): string {
		const metaId = channelState.currentAccount?.extraMeta?.profileId;
		const myId =
			typeof metaId === "string" || typeof metaId === "number"
				? String(metaId).trim()
				: channelState.currentAccount?.accountIdentifier || "";
		if (conversationId.includes(":") || conversationId.includes("-")) {
			const parts = conversationId
				.split(/[:-]/)
				.map((p) => p.trim())
				.filter(Boolean);
			if (myId) {
				const partner = parts.find((p) => p !== myId);
				if (partner) return partner;
			}
			if (parts.length >= 2 && parts[1]) return parts[1];
		}
		return conversationId;
	}

	private getMessageScopeKey(conversationId: string): string {
		const partnerId = this.normalizePartnerId(conversationId);
		return `${this.getScopeKey()}:${partnerId}`;
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
			// 若 Scruff / Jack'd IM WSS 统一长链已连接，消息由 WebSocket 实时推送，无需冗余的高频 HTTP 轮询
			if (relayImWs.connected) return;
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
		const channel = channelState.activeChannel;
		const account = channelState.currentAccount;
		if (channel === "scruff" || channel === "jackd") {
			relayImWs.connect(channel, account);
		} else {
			relayImWs.disconnect();
		}

		const scope = this.getScopeKey();
		this.conversations = [
			...(this.conversationsStore.get(scope) ?? []),
		].sort(
			(a, b) =>
				(b.lastMessageTimestamp ?? 0) - (a.lastMessageTimestamp ?? 0),
		);
		this.activeConversationId = null;
		this.messages = [];
	}

	/**
	 * 处理来自统一 IM WSS 长链推流报文 (messageRecvNotify / messageSendedNotify)
	 */
	private handleWsPacket(packet: RelayWsPacket): void {
		if (
			packet.type !== "messageRecvNotify" &&
			packet.type !== "messageSendedNotify"
		) {
			return;
		}

		const data = packet.data as RelayInboundMessageData | undefined;
		if (!data || !data.messageId) return;

		const channel = channelState.activeChannel;
		if (channel !== "scruff" && channel !== "jackd") return;

		const metaId = channelState.currentAccount?.extraMeta?.profileId;
		const myProfileId =
			typeof metaId === "string" || typeof metaId === "number"
				? String(metaId).trim()
				: channelState.currentAccount?.accountIdentifier || "";

		const senderId = String(data.sender ?? "").trim();
		const targetId = String(data.target ?? "").trim();
		const isFromMe =
			packet.type === "messageSendedNotify" ||
			(Boolean(myProfileId) && senderId === myProfileId);

		const partnerId = isFromMe ? targetId : senderId;
		if (!partnerId) return;

		const rawRecord = data as unknown as Record<string, unknown>;
		const content =
			data.messageContent ||
			(typeof rawRecord.message === "string" ? rawRecord.message : "") ||
			(typeof rawRecord.text === "string" ? rawRecord.text : "") ||
			(typeof rawRecord.content === "string" ? rawRecord.content : "") ||
			(data.attachment ? "[媒体附件]" : "");
		const timestamp = data.senderTime
			? Date.parse(data.senderTime)
			: Date.now();
		const messageId = String(data.messageId);

		// 1. 存入消息流
		const msgScope = this.getMessageScopeKey(partnerId);
		const currentMsgs = this.messagesStore.get(msgScope) ?? [];

		const exists = currentMsgs.some(
			(m) =>
				m.id === messageId ||
				(m.isFromMe === isFromMe &&
					m.text === content &&
					Math.abs(m.timestamp - timestamp) < 5000),
		);

		if (!exists) {
			const universalMsg: UniversalMessage = {
				channel,
				conversationId: data.conversationId || partnerId,
				id: messageId,
				isFromMe,
				recipientId: data.target,
				senderId: data.sender,
				status: "delivered",
				text: content,
				timestamp,
			};

			const nextMsgs = [...currentMsgs, universalMsg].sort(
				(a, b) => a.timestamp - b.timestamp,
			);
			this.messagesStore.set(msgScope, nextMsgs);

			// 如果当前正在查看该会话，立即推入活跃消息流
			const activePartner = this.activeConversationId
				? this.normalizePartnerId(this.activeConversationId)
				: null;
			if (activePartner === partnerId) {
				this.messages = nextMsgs;
			}
		}

		// 2. 更新或新建会话列表项
		const scope = this.getScopeKey();
		let conv = this.conversations.find(
			(c) =>
				c.targetUserId === partnerId ||
				c.conversationId === partnerId ||
				(Boolean(data.conversationId) &&
					c.conversationId === data.conversationId) ||
				c.conversationId.includes(partnerId),
		);

		const isCurrentlyActive =
			this.activeConversationId &&
			this.normalizePartnerId(this.activeConversationId) === partnerId;
		const unreadDelta = !isFromMe && !isCurrentlyActive ? 1 : 0;

		if (conv) {
			if (content) conv.lastMessageText = content;
			conv.lastMessageTimestamp = Math.max(
				conv.lastMessageTimestamp ?? 0,
				timestamp,
			);
			if (unreadDelta > 0) {
				conv.unreadCount = (conv.unreadCount || 0) + unreadDelta;
			}
			if (data.conversationId) {
				conv.conversationId = data.conversationId;
			}
		} else {
			const cachedGrid = channelGridState.findCachedUser(partnerId);
			const matchingAccount = channelState.accounts[channel]?.find(
				(a) =>
					a.extraMeta?.profileId === partnerId ||
					a.accountIdentifier === partnerId,
			);
			conv = {
				channel,
				conversationId: data.conversationId || partnerId,
				lastMessageText: content,
				lastMessageTimestamp: timestamp,
				rawPayload: data,
				targetAvatarUrl:
					cachedGrid?.avatarThumbnailUrl ||
					matchingAccount?.avatarUrl,
				targetUserId: partnerId,
				targetUserName:
					cachedGrid?.displayName ||
					matchingAccount?.name ||
					`User ${partnerId}`,
				unreadCount: unreadDelta,
			};
			this.conversations.push(conv);
		}

		// 按最后一条消息时间倒序重排
		this.conversations.sort(
			(a, b) =>
				(b.lastMessageTimestamp ?? 0) - (a.lastMessageTimestamp ?? 0),
		);
		this.conversationsStore.set(scope, this.conversations);
		this.saveToStorage();

		// 3. 异步水合用户信息
		if (
			conv.targetUserId &&
			(!conv.targetAvatarUrl || conv.targetUserName.startsWith("User "))
		) {
			void this.hydrateConversationUser(conv.targetUserId);
		}
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
			this.conversations = [...this.conversationsStore.get(scope)!].sort(
				(a, b) =>
					(b.lastMessageTimestamp ?? 0) -
					(a.lastMessageTimestamp ?? 0),
			);
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
				const pId = this.normalizePartnerId(c.conversationId);
				if (pId) localMap.set(pId, c);
			}

			// 智能合并远程拉取与本地缓存（保留较新的最后消息、优先使用已解析的真实头像与真实昵称）
			const mergedServerItems = serverItems.map((s) => {
				const partnerId = this.normalizePartnerId(s.conversationId);
				const local =
					localMap.get(s.conversationId) ||
					(s.targetUserId
						? localMap.get(s.targetUserId)
						: undefined) ||
					(partnerId ? localMap.get(partnerId) : undefined);

				const cachedGrid = s.targetUserId
					? channelGridState.findCachedUser(s.targetUserId)
					: undefined;

				const matchingAccount = s.targetUserId
					? channelState.accounts[channel]?.find(
							(a) =>
								a.extraMeta?.profileId === s.targetUserId ||
								a.accountIdentifier === s.targetUserId,
						)
					: undefined;

				const targetUserName =
					s.targetUserName && !s.targetUserName.startsWith("User ")
						? s.targetUserName
						: local?.targetUserName &&
							  !local.targetUserName.startsWith("User ")
							? local.targetUserName
							: cachedGrid?.displayName &&
								  !cachedGrid.displayName.startsWith("User ")
								? cachedGrid.displayName
								: matchingAccount?.name &&
									  !matchingAccount.name.startsWith("User ")
									? matchingAccount.name
									: s.targetUserName;

				const targetAvatarUrl =
					s.targetAvatarUrl ||
					local?.targetAvatarUrl ||
					cachedGrid?.avatarThumbnailUrl ||
					matchingAccount?.avatarUrl;

				const isCurrentlyActive =
					this.activeConversationId === s.conversationId ||
					(Boolean(s.targetUserId) &&
						this.activeConversationId === s.targetUserId);

				const unreadCount = isCurrentlyActive
					? 0
					: local &&
						  local.unreadCount === 0 &&
						  (local.lastMessageTimestamp ?? 0) >=
								(s.lastMessageTimestamp ?? 0)
						? 0
						: s.unreadCount;

				const hasNewerLocal =
					Boolean(local) &&
					(local!.lastMessageTimestamp ?? 0) >
						(s.lastMessageTimestamp ?? 0);

				const lastMessageText = hasNewerLocal
					? local?.lastMessageText || s.lastMessageText || ""
					: s.lastMessageText || local?.lastMessageText || "";

				const lastMessageTimestamp = hasNewerLocal
					? local!.lastMessageTimestamp
					: s.lastMessageTimestamp ||
						local?.lastMessageTimestamp ||
						0;

				return {
					...s,
					targetUserName,
					targetAvatarUrl,
					lastMessageText,
					lastMessageTimestamp,
					unreadCount,
				};
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

			const combined = [...localDrafts, ...mergedServerItems].sort(
				(a, b) =>
					(b.lastMessageTimestamp ?? 0) -
					(a.lastMessageTimestamp ?? 0),
			);
			this.conversations = combined;
			this.conversationsStore.set(scope, combined);
			this.saveToStorage();

			// 后台异步补全仍缺失头像或昵称的新用户信息
			for (const item of combined) {
				if (
					item.targetUserId &&
					(!item.targetAvatarUrl ||
						item.targetUserName.startsWith("User "))
				) {
					void this.hydrateConversationUser(item.targetUserId);
				}
			}
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

	markConversationAsRead(conversationId: string): void {
		const partnerId = this.normalizePartnerId(conversationId);
		let updated = false;
		const next = this.conversations.map((c) => {
			if (
				(c.conversationId === conversationId ||
					c.targetUserId === conversationId ||
					c.targetUserId === partnerId ||
					c.conversationId.includes(partnerId)) &&
				c.unreadCount > 0
			) {
				updated = true;
				return { ...c, unreadCount: 0 };
			}
			return c;
		});

		if (updated) {
			this.conversations = next;
			this.conversationsStore.set(this.getScopeKey(), next);
			this.saveToStorage();
		}
	}

	async selectConversation(conversationId: string): Promise<void> {
		this.activeConversationId = conversationId;
		// 立即将未读数归零，清除会话卡片上的未读标
		this.markConversationAsRead(conversationId);

		const msgScope = this.getMessageScopeKey(conversationId);
		let cachedMsgs = this.messagesStore.get(msgScope);

		// 如果历史数据存在未归一化 conversationId 的消息，尝试合并并迁移
		const rawScope = `${this.getScopeKey()}:${conversationId}`;
		if (rawScope !== msgScope && this.messagesStore.has(rawScope)) {
			const rawMsgs = this.messagesStore.get(rawScope) ?? [];
			const combined = [...(cachedMsgs ?? []), ...rawMsgs]
				.filter(
					(m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
				)
				.sort((a, b) => a.timestamp - b.timestamp);
			this.messagesStore.set(msgScope, combined);
			this.messagesStore.delete(rawScope);
			cachedMsgs = combined;
		}

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

			const lastMsg = mergedList[mergedList.length - 1];
			if (lastMsg?.text) {
				const conv = this.conversations.find(
					(c) =>
						c.conversationId === conversationId ||
						c.targetUserId === conversationId ||
						c.conversationId.includes(conversationId),
				);
				if (
					conv &&
					(!conv.lastMessageText ||
						conv.lastMessageTimestamp <= lastMsg.timestamp)
				) {
					this.updateConversationLastMessage(
						conv.conversationId,
						lastMsg.text,
					);
				}
			}
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
			this.activeConversation?.targetUserId ||
			this.normalizePartnerId(this.activeConversationId);
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

		// 乐观更新会话列表最后消息与时间，并重新倒序排列
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

	async hydrateConversationUser(userId: string): Promise<void> {
		if (channelState.activeChannel === "grindr" || !userId) return;
		if (this.hydratingUserIds.has(userId)) return;
		this.hydratingUserIds.add(userId);

		// 1. 优先尝试本地网格与已知账号秒开水合
		const cachedGrid = channelGridState.findCachedUser(userId);
		if (
			cachedGrid?.displayName &&
			!cachedGrid.displayName.startsWith("User ")
		) {
			this.updateConversationUserProfile(userId, {
				displayName: cachedGrid.displayName,
				avatarUrl: cachedGrid.avatarThumbnailUrl,
			});
		}

		const matchingAccount = channelState.accounts[
			channelState.activeChannel
		]?.find(
			(a) =>
				a.extraMeta?.profileId === userId ||
				a.accountIdentifier === userId,
		);
		if (
			matchingAccount?.name &&
			!matchingAccount.name.startsWith("User ")
		) {
			this.updateConversationUserProfile(userId, {
				displayName: matchingAccount.name,
				avatarUrl: matchingAccount.avatarUrl,
			});
		}

		// 2. 远端拉取资料补全
		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const profile = await provider.getUserDetail(userId, account);
			const avatar =
				profile.photos.find((p) => p.isAvatar)?.thumbnailUrl ||
				profile.photos[0]?.thumbnailUrl;
			this.updateConversationUserProfile(userId, {
				displayName: profile.displayName,
				avatarUrl: avatar,
			});
		} catch {
			// ignore
		} finally {
			this.hydratingUserIds.delete(userId);
		}
	}

	updateConversationUserProfile(
		userId: string,
		profile: { displayName?: string; avatarUrl?: string },
	): void {
		let updated = false;
		const nextConversations = this.conversations.map((c) => {
			const isMatch =
				c.targetUserId === userId ||
				c.conversationId === userId ||
				c.conversationId.includes(userId);

			if (isMatch) {
				const hasValidName =
					profile.displayName &&
					!profile.displayName.startsWith("User ");
				const targetUserName = hasValidName
					? profile.displayName!
					: c.targetUserName;
				const targetAvatarUrl = profile.avatarUrl || c.targetAvatarUrl;

				if (
					targetUserName !== c.targetUserName ||
					targetAvatarUrl !== c.targetAvatarUrl
				) {
					updated = true;
					return { ...c, targetUserName, targetAvatarUrl };
				}
			}
			return c;
		});

		if (updated) {
			this.conversations = nextConversations;
			this.conversationsStore.set(this.getScopeKey(), nextConversations);
			this.saveToStorage();
		}
	}

	private upsertConversationItem(params: {
		id: string;
		displayName?: string;
		avatarThumbnailUrl?: string;
		conversationId?: string;
		lastMessageText?: string;
		lastMessageTimestamp?: number;
	}): UniversalConversation {
		const channel = channelState.activeChannel;
		const userIdStr = String(params.id);
		const convId = params.conversationId || userIdStr;
		const scope = this.getScopeKey();

		let conv = this.conversations.find(
			(c) =>
				c.conversationId === convId ||
				c.conversationId === userIdStr ||
				(Boolean(c.targetUserId) && c.targetUserId === userIdStr) ||
				c.conversationId.includes(userIdStr),
		);

		const now = params.lastMessageTimestamp ?? Date.now();
		if (!conv) {
			conv = {
				channel,
				conversationId: convId,
				lastMessageText: params.lastMessageText ?? "",
				lastMessageTimestamp: now,
				targetAvatarUrl: params.avatarThumbnailUrl,
				targetUserId: userIdStr,
				targetUserName: params.displayName || `User ${userIdStr}`,
				unreadCount: 0,
			};
			this.conversations = [conv, ...this.conversations].sort(
				(a, b) =>
					(b.lastMessageTimestamp ?? 0) -
					(a.lastMessageTimestamp ?? 0),
			);
		} else {
			conv = {
				...conv,
				conversationId: convId,
				lastMessageText: params.lastMessageText ?? conv.lastMessageText,
				lastMessageTimestamp:
					params.lastMessageTimestamp ?? conv.lastMessageTimestamp,
				targetUserName:
					params.displayName &&
					(!conv.targetUserName ||
						conv.targetUserName.startsWith("User "))
						? params.displayName
						: conv.targetUserName,
				targetAvatarUrl:
					params.avatarThumbnailUrl || conv.targetAvatarUrl,
				unreadCount: 0,
			};
			const rest = this.conversations.filter(
				(c) =>
					c.conversationId !== conv!.conversationId &&
					(!conv!.targetUserId ||
						c.targetUserId !== conv!.targetUserId),
			);
			this.conversations = [conv, ...rest].sort(
				(a, b) =>
					(b.lastMessageTimestamp ?? 0) -
					(a.lastMessageTimestamp ?? 0),
			);
		}

		this.conversationsStore.set(scope, this.conversations);
		this.saveToStorage();

		if (
			conv.targetUserId &&
			(!conv.targetAvatarUrl || conv.targetUserName.startsWith("User "))
		) {
			void this.hydrateConversationUser(conv.targetUserId);
		}

		return conv;
	}

	updateConversationLastMessage(conversationId: string, text: string): void {
		const partnerId = this.normalizePartnerId(conversationId);
		let updated = false;
		const now = Date.now();
		const next = this.conversations.map((c) => {
			if (
				c.conversationId === conversationId ||
				c.targetUserId === conversationId ||
				c.targetUserId === partnerId ||
				c.conversationId.includes(partnerId)
			) {
				updated = true;
				return {
					...c,
					lastMessageText: text,
					lastMessageTimestamp: now,
				};
			}
			return c;
		});

		if (updated) {
			this.conversations = next.sort(
				(a, b) =>
					(b.lastMessageTimestamp ?? 0) -
					(a.lastMessageTimestamp ?? 0),
			);
			this.conversationsStore.set(this.getScopeKey(), this.conversations);
			this.saveToStorage();
		}
	}

	recordSentMessage(
		user: { id: string; displayName?: string; avatarThumbnailUrl?: string },
		message: UniversalMessage,
	): void {
		const userIdStr = String(user.id);
		const convId = message.conversationId || userIdStr;
		const conv = this.upsertConversationItem({
			id: userIdStr,
			displayName: user.displayName,
			avatarThumbnailUrl: user.avatarThumbnailUrl,
			conversationId: convId,
			lastMessageText: message.text,
			lastMessageTimestamp: message.timestamp || Date.now(),
		});

		const msgScope = this.getMessageScopeKey(conv.conversationId);
		const localMsgs = this.messagesStore.get(msgScope) ?? [];
		if (!localMsgs.some((m) => m.id === message.id)) {
			const updatedMsgs = [...localMsgs, message];
			this.messagesStore.set(msgScope, updatedMsgs);
			if (
				this.activeConversationId === conv.conversationId ||
				this.activeConversationId === userIdStr
			) {
				this.messages = updatedMsgs;
			}
			this.saveToStorage();
		}
	}

	openChatWithUser(user: {
		id: string;
		displayName?: string;
		avatarThumbnailUrl?: string;
	}): void {
		const conv = this.upsertConversationItem(user);
		this.activeConversationId = conv.conversationId;
		this.markConversationAsRead(conv.conversationId);
		const msgScope = this.getMessageScopeKey(conv.conversationId);
		this.messages = this.messagesStore.get(msgScope) ?? [];
		void this.loadMessages(conv.conversationId);
	}
}

export const channelChatState = new ChannelChatState();

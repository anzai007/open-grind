import type {
	ConversationQueryParams,
	MessageQueryParams,
	NearbyQueryParams,
	SendMessageParams,
	SocialChannelProvider,
	VerifyAccountResult,
} from "../provider";
import {
	queryPlatformAccount,
	resolveEffectiveProxy,
} from "../scruff-protocol/proxy-helper";
import { RelayClient } from "../scruff-protocol/relay-client";
import { relayImWs } from "../scruff-protocol/relay-im-ws.svelte";
import { resolvePartnerProfileId } from "../scruff-protocol/scruff-base-provider";
import {
	syncSubAccountProfile,
	verifySubAccount,
} from "../sub-protocol/sub-account-verifier";
import {
	parseRawSubProfile,
	parseSubGridUser,
	type RawSubProfile,
	subMediaUrl,
} from "../sub-protocol/sub-profile-parser";
import {
	CHANNEL_METAS,
	type ChannelAccount,
	type ChannelMeta,
	type PageResult,
	type UniversalConversation,
	type UniversalGridUser,
	type UniversalInteractionResult,
	type UniversalMessage,
	type UniversalUserProfile,
} from "../types";

export class SubProvider implements SocialChannelProvider {
	readonly channel = "sub" as const;
	readonly meta: ChannelMeta = CHANNEL_METAS.sub;
	private readonly client: RelayClient;

	constructor() {
		this.client = new RelayClient({ platform: "sub" });
	}

	private async ensureAccountProxy(
		account?: ChannelAccount,
	): Promise<ChannelAccount | undefined> {
		if (
			!account?.accountIdentifier ||
			(account.proxyUrl && account.proxyUrl.includes("@"))
		) {
			return account;
		}
		try {
			const info = await queryPlatformAccount(
				"sub",
				account.accountIdentifier,
				2000,
			);
			if (info?.proxyUrl) {
				return {
					...account,
					proxyUrl: resolveEffectiveProxy(
						account.proxyUrl,
						info.proxyUrl,
					),
				};
			}
		} catch {
			// 降级使用原配置
		}
		return account;
	}

	async getNearbyUsers(
		params: NearbyQueryParams,
	): Promise<PageResult<UniversalGridUser>> {
		const offset = params.offset ?? 0;
		const limit = 24;
		const page = Math.floor(offset / limit) + 1;
		const account = await this.ensureAccountProxy(params.account);

		// 1. 优先尝试从本地/自建 ai-growth 用户池服务拉取真实候选用户
		try {
			const res = await this.client.request<{
				code?: number;
				data?: { items?: RawSubProfile[]; total?: number };
				items?: RawSubProfile[];
				total?: number;
			}>({
				account,
				method: "GET",
				path: "/_ai_growth_api/api/social-touch/sub/user-pool",
				query: { page, pageSize: limit },
				timeoutMs: 4000,
			});

			const rawList = res.data?.items || res.items || [];
			if (rawList.length > 0) {
				const items: UniversalGridUser[] =
					rawList.map(parseSubGridUser);
				const total = res.data?.total || res.total || items.length;
				const canHaveMore = offset + items.length < total;

				return {
					hasNext: canHaveMore,
					items,
					nextOffset: canHaveMore ? offset + items.length : undefined,
					offset,
					total,
				};
			}
		} catch {
			// ai-growth 用户池不可达或未登录时，优雅降级
		}

		// 2. 降级方案：从中继已登记的平台账号与最近会话伙伴中提取候选人
		const fallbackItems: UniversalGridUser[] = [];
		const seenIds = new Set<string>();

		try {
			const relayAccountsRes = await this.client.request<{
				ret?: boolean;
				data?: {
					items?: Array<{
						account?: string;
						platformUserId?: string;
						latitude?: string | number;
						longitude?: string | number;
					}>;
				};
			}>({
				account,
				headers: { "omni-platform": "sub" },
				method: "GET",
				path: "https://omni-api.toonhub.top/platform/accounts?platformName=sub&pageSize=50",
				timeoutMs: 4000,
			});

			const platformAccounts = relayAccountsRes.data?.items || [];
			for (const p of platformAccounts) {
				const uid = String(p.platformUserId || p.account || "");
				if (!uid || seenIds.has(uid)) continue;
				seenIds.add(uid);

				fallbackItems.push({
					avatarThumbnailUrl: "",
					channel: this.channel,
					displayName: `Sub ${uid}`,
					headline: `已在中继后台登记 (账号: ${p.account || uid})`,
					id: uid,
					isOnline: true,
					tags: ["Sub平台账号"],
				});
			}
		} catch {
			// ignore
		}

		// 3. 从已有会话列表中提取活跃联系人
		const myId =
			(account?.extraMeta?.profileId as string | undefined) ||
			account?.accountIdentifier ||
			"";

		if (myId) {
			try {
				const convsRes = await this.client.request<{
					ret?: boolean;
					data?: Array<Record<string, unknown>>;
				}>({
					account,
					method: "GET",
					path: "/_private/im/conversations",
					query: { platform: "sub", user: myId },
					timeoutMs: 4000,
				});

				const list = convsRes.data || [];
				for (const c of list) {
					const targetId = resolvePartnerProfileId(c, myId);
					if (!targetId || seenIds.has(targetId)) continue;
					seenIds.add(targetId);

					const lastMsg = c.lastMessage as
						| Record<string, unknown>
						| undefined;
					fallbackItems.push({
						avatarThumbnailUrl: "",
						channel: this.channel,
						displayName: `Sub ${targetId}`,
						headline:
							(lastMsg?.messageContent as string) ||
							"最近私信联系人",
						id: targetId,
						isOnline: false,
						tags: ["活跃联系人"],
					});
				}
			} catch {
				// ignore
			}
		}

		return {
			hasNext: false,
			items: fallbackItems,
			offset: 0,
			total: fallbackItems.length,
		};
	}

	// 前端轻量详情缓存（15分钟有效）
	private profileDetailCache = new Map<
		string,
		{ profile: UniversalUserProfile; expiresAt: number }
	>();

	async getUserDetail(
		userId: string,
		account?: ChannelAccount,
	): Promise<UniversalUserProfile> {
		const cached = this.profileDetailCache.get(userId);
		if (cached && Date.now() < cached.expiresAt) {
			return cached.profile;
		}

		const effAccount = await this.ensureAccountProxy(account);

		// 1. 优先尝试从本地/自建 ai-growth 接口查询详情
		try {
			const res = await this.client.request<{
				code?: number;
				data?: RawSubProfile | RawSubProfile[];
			}>({
				account: effAccount,
				method: "GET",
				path: `/_ai_growth_api/api/social-touch/sub/user-pool/${encodeURIComponent(userId)}`,
				timeoutMs: 5000,
			});

			const p = Array.isArray(res.data) ? res.data[0] : res.data;
			if (p) {
				const parsed = parseRawSubProfile(p);
				this.profileDetailCache.set(userId, {
					expiresAt: Date.now() + 15 * 60 * 1000,
					profile: parsed,
				});
				return parsed;
			}
		} catch {
			// 降级使用基础档案
		}

		// 2. 兜底生成基础资料对象
		const fallbackProfile: UniversalUserProfile = {
			about: "Sub 平台用户",
			channel: this.channel,
			displayName: `Sub ${userId}`,
			id: userId,
			isOnline: false,
			photos: [],
		};

		this.profileDetailCache.set(userId, {
			expiresAt: Date.now() + 5 * 60 * 1000,
			profile: fallbackProfile,
		});

		return fallbackProfile;
	}

	async getConversations(
		params?: ConversationQueryParams,
	): Promise<PageResult<UniversalConversation>> {
		const account = await this.ensureAccountProxy(params?.account);

		const userIdentifier =
			(account?.extraMeta?.profileId as string | undefined) ||
			account?.accountIdentifier ||
			"";

		const res = await this.client.request<{
			ret?: boolean;
			data?: Array<Record<string, unknown>>;
		}>({
			account,
			method: "GET",
			path: "/_private/im/conversations",
			query: { platform: "sub", user: userIdentifier },
			timeoutMs: 12000,
		});

		const list = res.data || [];
		const items: UniversalConversation[] = list.map((c) => {
			const targetId = resolvePartnerProfileId(c, userIdentifier);
			const cachedProfile = targetId
				? this.profileDetailCache.get(targetId)?.profile
				: undefined;

			const avatarUrl =
				(c.target_avatar_url as string) ||
				(c.targetAvatarUrl as string) ||
				(c.avatar as string) ||
				cachedProfile?.photos.find((p) => p.isAvatar)?.thumbnailUrl ||
				cachedProfile?.photos[0]?.thumbnailUrl;

			let lastMsgObj: Record<string, unknown> | null = null;
			if (typeof c.lastMessage === "object" && c.lastMessage !== null) {
				lastMsgObj = c.lastMessage as Record<string, unknown>;
			} else if (
				typeof c.last_message === "object" &&
				c.last_message !== null
			) {
				lastMsgObj = c.last_message as Record<string, unknown>;
			}

			let lastMessageText = "";
			if (typeof c.last_message === "string" && c.last_message) {
				lastMessageText = c.last_message;
			} else if (typeof c.lastMessage === "string" && c.lastMessage) {
				lastMessageText = c.lastMessage;
			} else if (
				typeof c.messageContent === "string" &&
				c.messageContent
			) {
				lastMessageText = c.messageContent;
			} else if (typeof c.content === "string" && c.content) {
				lastMessageText = c.content;
			} else if (lastMsgObj) {
				lastMessageText =
					(lastMsgObj.messageContent as string) ||
					(lastMsgObj.content as string) ||
					(lastMsgObj.text as string) ||
					"";
				if (
					!lastMessageText &&
					(lastMsgObj.attachment as
						| Record<string, unknown>
						| undefined)
				) {
					lastMessageText = "[图片]";
				}
			}

			const rawTime =
				c.last_message_at ??
				c.lastMessageAt ??
				lastMsgObj?.senderTime ??
				lastMsgObj?.created_at;

			const lastMessageTimestamp = rawTime
				? typeof rawTime === "number"
					? rawTime > 1e11
						? rawTime
						: rawTime * 1000
					: typeof rawTime === "string"
						? new Date(rawTime).getTime()
						: 0
				: 0;

			const unread = Number(c.unread_count ?? c.unreadCount ?? 0);
			const rawConvId = c.conversation_id ?? c.conversationId ?? targetId;
			const conversationId =
				typeof rawConvId === "string" || typeof rawConvId === "number"
					? String(rawConvId)
					: targetId;

			const targetUserName =
				(c.target_name as string) ||
				(c.targetName as string) ||
				(cachedProfile?.displayName &&
				!cachedProfile.displayName.startsWith("Sub ")
					? cachedProfile.displayName
					: undefined) ||
				`Sub ${targetId}`;

			return {
				channel: this.channel,
				conversationId,
				lastMessageText,
				lastMessageTimestamp,
				rawPayload: c,
				targetAvatarUrl: avatarUrl ? subMediaUrl(avatarUrl) : undefined,
				targetUserId: targetId,
				targetUserName,
				unreadCount: Number.isNaN(unread) ? 0 : unread,
			};
		});

		// 自动并行水合前 8 个活跃会话的昵称与头像
		const missingTargets = items
			.filter(
				(it) =>
					Boolean(it.targetUserId) &&
					(!it.targetAvatarUrl ||
						it.targetUserName.startsWith("Sub ")),
			)
			.slice(0, 8);

		if (missingTargets.length > 0) {
			await Promise.allSettled(
				missingTargets.map(async (conv) => {
					try {
						const profile = await this.getUserDetail(
							conv.targetUserId,
							account,
						);
						if (
							profile.displayName &&
							!profile.displayName.startsWith("Sub ")
						) {
							conv.targetUserName = profile.displayName;
						}
						const avatar =
							profile.photos.find((p) => p.isAvatar)
								?.thumbnailUrl ||
							profile.photos[0]?.thumbnailUrl;
						if (avatar) {
							conv.targetAvatarUrl = subMediaUrl(avatar);
						}
					} catch {
						// 降级使用原始 User ID
					}
				}),
			);
		}

		return {
			hasNext: false,
			items,
			offset: params?.offset ?? 0,
			total: items.length,
		};
	}

	async getMessages(
		conversationId: string,
		params?: MessageQueryParams,
	): Promise<UniversalMessage[]> {
		const account = await this.ensureAccountProxy(params?.account);
		const metaId = account?.extraMeta?.profileId;
		const myId =
			typeof metaId === "string" || typeof metaId === "number"
				? String(metaId)
				: account?.accountIdentifier || "";

		let targetProfileId = conversationId;
		if (targetProfileId.includes(":") || targetProfileId.includes("-")) {
			const parts = targetProfileId.split(/[:-]/);
			targetProfileId =
				parts.find((p) => p && p !== myId) ||
				parts[1] ||
				parts[0] ||
				targetProfileId;
		}

		try {
			const res = await this.client.request<{
				ret?: boolean;
				data?: Array<{
					messageId?: string;
					conversationId?: string;
					sender?: string | number;
					target?: string | number;
					messageContent?: string;
					senderTime?: string | number;
					attachment?: {
						url?: string;
						type?: string;
						metadata?: { url?: string; [key: string]: unknown };
						[key: string]: unknown;
					} | null;
					[key: string]: unknown;
				}>;
			}>({
				account,
				method: "GET",
				path: "/_private/im/messages",
				query: {
					conversationId,
					direction: "desc",
					platform: "sub",
					size: 50,
				},
				timeoutMs: 12000,
			});

			const list = res.data || [];
			return list.map((m) => {
				const time = m.senderTime
					? typeof m.senderTime === "number"
						? m.senderTime > 1e11
							? m.senderTime
							: m.senderTime * 1000
						: new Date(m.senderTime).getTime()
					: Date.now();
				const senderId = String(m.sender ?? "");
				const recipientId = String(m.target ?? targetProfileId);
				const isFromMe = Boolean(myId && senderId === myId);

				const rawUrl = m.attachment?.metadata?.url || m.attachment?.url;
				const mediaUrl = rawUrl ? subMediaUrl(rawUrl) : undefined;

				return {
					channel: this.channel,
					conversationId,
					id: String(m.messageId || crypto.randomUUID()),
					isFromMe,
					mediaUrl,
					rawPayload: m,
					recipientId,
					senderId,
					status: "delivered",
					text: m.messageContent || (mediaUrl ? "[图片]" : ""),
					timestamp: time,
				};
			});
		} catch (err) {
			console.warn("Sub getMessages fallback to empty:", err);
			return [];
		}
	}

	async sendMessage(params: SendMessageParams): Promise<UniversalMessage> {
		const account = await this.ensureAccountProxy(params.account);
		const metaId = account?.extraMeta?.profileId;
		const myId =
			typeof metaId === "string" || typeof metaId === "number"
				? String(metaId)
				: account?.accountIdentifier || "me";

		let targetUserId = params.targetUserId;
		if (targetUserId.includes(":") || targetUserId.includes("-")) {
			const parts = targetUserId.split(/[:-]/);
			targetUserId =
				parts.find((p) => p && p !== myId) || parts[0] || targetUserId;
		}

		let guid: string = crypto.randomUUID();
		let messageTimestamp = Date.now();

		// 1. 优先尝试走 WSS 统一长链模式 (WebSocket messageSend)
		if (relayImWs.connected && myId !== "me") {
			try {
				const wsResult = await relayImWs.sendTextMessage({
					channel: "sub",
					conversationId: params.conversationId,
					sender: myId,
					target: targetUserId,
					text: params.text,
				});
				if (wsResult.messageId) {
					guid = wsResult.messageId;
				}
				if (wsResult.senderTime) {
					messageTimestamp = new Date(wsResult.senderTime).getTime();
				}
				return {
					channel: this.channel,
					conversationId: params.conversationId || targetUserId,
					id: guid,
					isFromMe: true,
					recipientId: targetUserId,
					senderId: myId,
					status: "sent",
					text: params.text,
					timestamp: messageTimestamp,
				};
			} catch (wsErr) {
				console.warn(
					"WSS messageSend failed for Sub, returning optimistic message:",
					wsErr,
				);
			}
		}

		return {
			channel: this.channel,
			conversationId: params.conversationId || targetUserId,
			id: guid,
			isFromMe: true,
			recipientId: targetUserId,
			senderId: myId,
			status: "sent",
			text: params.text,
			timestamp: messageTimestamp,
		};
	}

	async sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult> {
		// Sub 打招呼 (Say Hi) 互动
		try {
			await this.sendMessage({ account, targetUserId, text: "你好 👋" });
		} catch (err) {
			console.warn("Sub Say Hi interaction fallback:", err);
		}

		return {
			interactionType: "say_hi",
			message: "已向对方发送打招呼 (Say Hi)",
			success: true,
			targetUserId,
		};
	}

	async verifyAccount(account: ChannelAccount): Promise<VerifyAccountResult> {
		return verifySubAccount(this.client, account);
	}

	async syncAccountProfile(account: ChannelAccount): Promise<ChannelAccount> {
		return syncSubAccountProfile(this.client, account);
	}

	async getViewers(account?: ChannelAccount): Promise<UniversalGridUser[]> {
		try {
			const res = await this.getConversations({ account });
			return res.items
				.slice(0, 20)
				.map((c) => ({
					avatarThumbnailUrl: c.targetAvatarUrl || "",
					channel: this.channel,
					displayName: c.targetUserName,
					id: c.targetUserId,
					isOnline: false,
				}));
		} catch {
			return [];
		}
	}

	async getInteractions(
		account?: ChannelAccount,
	): Promise<UniversalConversation[]> {
		try {
			const res = await this.getConversations({ account });
			const keyword = "hi";
			const interactions = res.items.filter(
				(c) =>
					c.lastMessageText.toLowerCase().includes(keyword) ||
					c.unreadCount > 0,
			);
			return interactions.length > 0
				? interactions
				: res.items.slice(0, 20);
		} catch {
			return [];
		}
	}
}

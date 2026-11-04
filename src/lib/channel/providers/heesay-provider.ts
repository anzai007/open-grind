import {
	syncHeesayAccountProfile,
	verifyHeesayAccount,
} from "../heesay-protocol/heesay-account-verifier";
import {
	parseRawHeesayProfile,
	type RawHeesayProfile,
} from "../heesay-protocol/heesay-profile-parser";
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

export class HeesayProvider implements SocialChannelProvider {
	readonly channel = "heesay" as const;
	readonly meta: ChannelMeta = CHANNEL_METAS.heesay;
	private readonly client: RelayClient;

	constructor() {
		this.client = new RelayClient({ platform: "heesay" });
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
				"heesay",
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
		const limit = 70;

		const filters: Record<string, string> = {
			age: "18-100",
			height: "0-500",
			is_human_face: "0",
			is_online: "0",
			new_face: "0",
			private_photo_count: "0",
			weight: "30-200",
		};

		const query: Record<string, unknown> = {
			filters: JSON.stringify(filters),
			isMapSearch: 0,
			latitude: params.lat,
			limit,
			longitude: params.lon,
			sort_by: "index_only",
			start: offset,
		};

		const account = await this.ensureAccountProxy(params.account);

		const res = await this.client.request<{
			code?: number;
			data?: RawHeesayProfile[];
			results?: RawHeesayProfile[];
		}>({ account, method: "GET", path: "/users", query, timeoutMs: 12000 });

		const rawList = res.data || res.results || [];
		const items: UniversalGridUser[] = [];

		for (const p of rawList) {
			const parsed = parseRawHeesayProfile(p);
			const thumbUrl =
				parsed.photos[0]?.thumbnailUrl ||
				p.avatar ||
				p.raw_avatar ||
				"";
			const fullUrl = parsed.photos[0]?.fullsizeUrl || thumbUrl;

			items.push({
				age: parsed.age,
				avatarFullUrl: fullUrl || undefined,
				avatarThumbnailUrl: thumbUrl,
				channel: this.channel,
				displayName: parsed.displayName,
				distanceMeters: parsed.distanceMeters,
				distanceText: parsed.distanceText,
				headline: parsed.about,
				id: parsed.id,
				isOnline: parsed.isOnline,
				rawPayload: p,
				tags: parsed.communityTags,
			});
		}

		// Heesay 分页规则：每次按实际拉取到的数量推进 start
		const canHaveMore = rawList.length >= 10;
		const nextOffset = canHaveMore
			? offset + (rawList.length || limit)
			: undefined;

		return {
			hasNext: canHaveMore,
			items,
			nextOffset,
			offset,
			total: items.length,
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

		// 1. 请求用户主资料
		const res = await this.client.request<{
			code?: number;
			data?: RawHeesayProfile[];
			results?: RawHeesayProfile[];
		}>({
			account: effAccount,
			method: "GET",
			path: `/users/${encodeURIComponent(userId)}`,
			timeoutMs: 8000,
		});

		const list = res.data || res.results || [];
		const p = list[0];
		if (!p) {
			throw new Error(`${this.meta.name} profile not found: ${userId}`);
		}

		// 2. 尝试追加读取相册列表
		try {
			const albumRes = await this.client.request<{
				code?: number;
				data?: Array<{
					album?: Array<{ url?: string; thumbnail?: string }>;
					vice_avatar?: string;
				}>;
			}>({
				account: effAccount,
				method: "GET",
				path: `/users/${encodeURIComponent(userId)}/additional/albums`,
				timeoutMs: 4000,
			});

			const albumData = albumRes.data?.[0];
			if (albumData) {
				if (Array.isArray(albumData.album)) {
					p.album = albumData.album;
				}
				if (albumData.vice_avatar) {
					p.vice_avatar = albumData.vice_avatar;
				}
			}
		} catch {
			// 相册属于增强资料，允许降级
		}

		const parsed = parseRawHeesayProfile(p);
		this.profileDetailCache.set(userId, {
			expiresAt: Date.now() + 15 * 60 * 1000,
			profile: parsed,
		});
		return parsed;
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
			query: { platform: "heesay", user: userIdentifier },
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
			} else if (
				typeof c.last_message_snapshot === "string" &&
				c.last_message_snapshot
			) {
				try {
					lastMsgObj = JSON.parse(c.last_message_snapshot) as Record<
						string,
						unknown
					>;
				} catch {
					// ignore
				}
			}

			let lastMessageText = "";
			if (typeof c.last_message === "string" && c.last_message) {
				lastMessageText = c.last_message;
			} else if (typeof c.lastMessage === "string" && c.lastMessage) {
				lastMessageText = c.lastMessage;
			} else if (
				typeof c.last_message_content === "string" &&
				c.last_message_content
			) {
				lastMessageText = c.last_message_content;
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
					(lastMsgObj.message as string) ||
					(lastMsgObj.text as string) ||
					"";
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
				!cachedProfile.displayName.startsWith("Heesay ")
					? cachedProfile.displayName
					: undefined) ||
				`Heesay ${targetId}`;

			return {
				channel: this.channel,
				conversationId,
				lastMessageText,
				lastMessageTimestamp,
				rawPayload: c,
				targetAvatarUrl: avatarUrl,
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
						it.targetUserName.startsWith("Heesay ")),
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
							!profile.displayName.startsWith("Heesay ")
						) {
							conv.targetUserName = profile.displayName;
						}
						const avatar =
							profile.photos.find((p) => p.isAvatar)
								?.thumbnailUrl ||
							profile.photos[0]?.thumbnailUrl;
						if (avatar) {
							conv.targetAvatarUrl = avatar;
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
		if (targetProfileId.includes(":")) {
			const parts = targetProfileId.split(":");
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
					platform: "heesay",
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

				return {
					channel: this.channel,
					conversationId,
					id: String(m.messageId || crypto.randomUUID()),
					isFromMe,
					mediaUrl: m.attachment?.url,
					rawPayload: m,
					recipientId,
					senderId,
					status: "delivered",
					text: m.messageContent || "",
					timestamp: time,
				};
			});
		} catch (err) {
			console.warn("Heesay getMessages fallback to empty:", err);
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
					channel: "heesay",
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
					"WSS messageSend failed for Heesay, returning optimistic message:",
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
		// Heesay 打招呼 (Say Hi) 互动
		try {
			await this.sendMessage({ account, targetUserId, text: "Hi" });
		} catch (err) {
			console.warn("Heesay Say Hi interaction fallback:", err);
		}

		return {
			interactionType: "say_hi",
			message: "已向对方发送打招呼 (Say Hi)",
			success: true,
			targetUserId,
		};
	}

	async verifyAccount(account: ChannelAccount): Promise<VerifyAccountResult> {
		return verifyHeesayAccount(this.client, account);
	}

	async syncAccountProfile(account: ChannelAccount): Promise<ChannelAccount> {
		return syncHeesayAccountProfile(this.client, account);
	}

	async getViewers(account?: ChannelAccount): Promise<UniversalGridUser[]> {
		// Heesay 访客回退兼容
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

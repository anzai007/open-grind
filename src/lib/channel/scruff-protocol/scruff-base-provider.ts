import type {
	ConversationQueryParams,
	MessageQueryParams,
	NearbyQueryParams,
	SendMessageParams,
	SocialChannelProvider,
	VerifyAccountResult,
} from "../provider";
import {
	type ChannelAccount,
	type ChannelMeta,
	type PageResult,
	type SocialChannelType,
	type UniversalConversation,
	type UniversalGridUser,
	type UniversalInteractionResult,
	type UniversalMessage,
	type UniversalUserProfile,
} from "../types";
import { parseRawScruffProfile, type RawScruffProfile } from "./profile-parser";
import { queryPlatformAccount, resolveEffectiveProxy } from "./proxy-helper";
import { RelayClient } from "./relay-client";
import {
	syncScruffAccountProfile,
	verifyScruffAccount,
} from "./scruff-account-verifier";
import { buildScruffPhotoUrl } from "./scruff-options";

export abstract class ScruffProtocolBaseProvider implements SocialChannelProvider {
	abstract readonly channel: SocialChannelType;
	abstract readonly meta: ChannelMeta;
	protected readonly client: RelayClient;

	constructor(platform: "scruff" | "jackd") {
		this.client = new RelayClient({ platform });
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
				this.channel === "jackd" ? "jackd" : "scruff",
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
		const query: Record<string, unknown> = {
			device_type: 1,
			fullsize_constraint: "-fullsize-400K",
			latitude: params.lat,
			limit: 1000,
			longitude: params.lon,
			offset,
			query_sort_type: 3,
			thumbnail_constraint: "-thumbnail-300",
		};

		if (params.filterTags && params.filterTags.length > 0) {
			query.hashtags = JSON.stringify(params.filterTags);
		}

		const account = await this.ensureAccountProxy(params.account);

		const res = await this.client.request<{
			results?: RawScruffProfile[];
			data?: RawScruffProfile[];
		}>({
			account,
			method: "GET",
			path: "/app/location",
			query,
			timeoutMs: 12000,
		});

		const rawList = res.results || res.data || [];
		const items: UniversalGridUser[] = [];

		for (const p of rawList) {
			const thumbKey =
				p.avatar_thumbnail_key || p.profile_photos?.[0]?.thumbnail_key;
			const fullKey =
				p.avatar_fullsize_key ||
				p.profile_photos?.[0]?.fullsize_key ||
				thumbKey;

			const avatarThumb = buildScruffPhotoUrl(thumbKey, "thumbnail");
			const avatarFull = buildScruffPhotoUrl(fullKey, "fullsize");

			items.push({
				channel: this.channel,
				id: String(p.id),
				displayName: p.name || `User ${p.id}`,
				age: p.age,
				avatarThumbnailUrl: avatarThumb,
				avatarFullUrl: avatarFull,
				distanceMeters:
					p.distance !== undefined
						? Math.round(p.distance * 1000)
						: null,
				distanceText:
					p.distance !== undefined
						? `${p.distance.toFixed(1)} km`
						: undefined,
				isOnline: Boolean(p.logged_in),
				headline: p.about || undefined,
				tags: p.hashtags ?? [],
				rawPayload: p,
			});
		}

		// Scruff 协议族分页规范：offset 步长推进 100；单个定位点附近最多获取 2000 人，最多请求至第 20 页 (offset 0..1900)
		const MAX_OFFSET = 1900;
		const canHaveMore = rawList.length > 0 && offset < MAX_OFFSET;
		const nextOffset = canHaveMore ? offset + 100 : undefined;

		return {
			items,
			offset,
			nextOffset,
			hasNext: canHaveMore,
			total: items.length,
		};
	}

	// 前端轻量详情缓存（15分钟有效），避免短时间内重复点击同一用户发起重复网络请求
	private profileDetailCache = new Map<
		string,
		{ profile: UniversalUserProfile; expiresAt: number }
	>();

	async getUserDetail(
		userId: string,
		account?: ChannelAccount,
	): Promise<UniversalUserProfile> {
		// 1. 检查前端轻量缓存，存在且未过期则 0ms 瞬间返回
		const cached = this.profileDetailCache.get(userId);
		if (cached && Date.now() < cached.expiresAt) {
			return cached.profile;
		}

		const effAccount = await this.ensureAccountProxy(account);

		// 2. 直接单次请求 omni-relay 中继用户详情，快速且唯一调用
		const res = await this.client.request<{
			data?: RawScruffProfile[];
			results?: RawScruffProfile[];
		}>({
			account: effAccount,
			method: "GET",
			path: "/app/profile",
			query: {
				api_version: 2,
				fullsize_constraint: "-fullsize-400K",
				target: userId,
				thumbnail_constraint: "-thumbnail-300",
			},
			timeoutMs: 8000,
		});

		const list = res.results || res.data || [];
		const p = list[0];
		if (!p) {
			throw new Error(`${this.meta.name} profile not found: ${userId}`);
		}

		const parsed = parseRawScruffProfile(p, this.channel);
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
			query: { platform: this.client.platform, user: userIdentifier },
			timeoutMs: 12000,
		});

		const list = res.data || [];
		const items: UniversalConversation[] = list.map((c) => {
			const rawTarget =
				c.target_user_id ?? c.targetUserId ?? c.target ?? "";
			const targetId =
				typeof rawTarget === "string" || typeof rawTarget === "number"
					? String(rawTarget)
					: "";
			const thumbKey =
				(c.avatar_thumbnail_key as string) ||
				(c.avatarThumbnailKey as string) ||
				"";

			const cachedProfile = targetId
				? this.profileDetailCache.get(targetId)?.profile
				: undefined;

			const avatarUrl =
				(c.target_avatar_url as string) ||
				(c.targetAvatarUrl as string) ||
				cachedProfile?.photos.find((p) => p.isAvatar)?.thumbnailUrl ||
				cachedProfile?.photos[0]?.thumbnailUrl ||
				(thumbKey ? buildScruffPhotoUrl(thumbKey) : undefined);

			const lastMsgObj =
				typeof c.lastMessage === "object" && c.lastMessage !== null
					? (c.lastMessage as Record<string, unknown>)
					: typeof c.last_message === "object" &&
						  c.last_message !== null
						? (c.last_message as Record<string, unknown>)
						: null;

			let lastMessageText = "";
			if (typeof c.last_message === "string" && c.last_message) {
				lastMessageText = c.last_message;
			} else if (typeof c.lastMessage === "string" && c.lastMessage) {
				lastMessageText = c.lastMessage;
			} else if (lastMsgObj) {
				const content =
					(lastMsgObj.messageContent as string) ||
					(lastMsgObj.message as string) ||
					(lastMsgObj.text as string) ||
					"";
				if (content) {
					lastMessageText = content;
				} else if (lastMsgObj.attachment) {
					const att = lastMsgObj.attachment as Record<
						string,
						unknown
					>;
					if (att.type === "image" || att.type === "scruff_image") {
						lastMessageText = "[图片]";
					} else if (att.type === "audio" || att.type === "voice") {
						lastMessageText = "[语音]";
					} else if (att.type === "video") {
						lastMessageText = "[视频]";
					} else {
						lastMessageText = "[附件]";
					}
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
				!cachedProfile.displayName.startsWith("User ")
					? cachedProfile.displayName
					: undefined) ||
				`User ${targetId}`;

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

		// 自动并行水合未解析真实昵称/头像的目标用户资料 (最多取前 8 个活跃会话)
		const missingTargets = items
			.filter(
				(it) =>
					Boolean(it.targetUserId) &&
					(!it.targetAvatarUrl ||
						it.targetUserName.startsWith("User ")),
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
							!profile.displayName.startsWith("User ")
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

	async syncAccountProfile(account: ChannelAccount): Promise<ChannelAccount> {
		return syncScruffAccountProfile(this.client, this.channel, account);
	}

	async getViewers(account?: ChannelAccount): Promise<UniversalGridUser[]> {
		try {
			const res = await this.client.request<{
				results?: RawScruffProfile[];
			}>({
				account,
				method: "GET",
				path: "/app/viewers/incoming",
				query: {
					api_version: 2,
					fullsize_constraint: "-fullsize-400K",
					latitude: 0,
					limit: 40,
					longitude: 0,
					offset: 0,
					query_sort_type: 1,
					thumbnail_constraint: "-thumbnail-300",
				},
				timeoutMs: 6000,
			});

			const list = res.results || [];
			return list.map((p) => {
				const thumbKey =
					p.avatar_thumbnail_key ||
					p.profile_photos?.[0]?.thumbnail_key;
				const fullKey =
					p.avatar_fullsize_key ||
					p.profile_photos?.[0]?.fullsize_key ||
					thumbKey;
				return {
					age: p.age,
					avatarFullUrl: buildScruffPhotoUrl(fullKey, "fullsize"),
					avatarThumbnailUrl: buildScruffPhotoUrl(
						thumbKey,
						"thumbnail",
					),
					channel: this.channel,
					displayName: p.name || `User ${p.id}`,
					distanceMeters: null,
					headline: p.about || undefined,
					id: String(p.id),
					isOnline: Boolean(p.logged_in),
					rawPayload: p,
					tags: p.hashtags ?? [],
				};
			});
		} catch (err) {
			console.warn("getViewers fallback to empty:", err);
			return [];
		}
	}

	async getInteractions(
		account?: ChannelAccount,
	): Promise<UniversalConversation[]> {
		try {
			const res = await this.getConversations({ account });
			const keyword = this.channel === "jackd" ? "wave" : "woof";
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
		} else if (targetProfileId.includes("-")) {
			const parts = targetProfileId.split("-");
			targetProfileId =
				parts.find((p) => p && p !== myId) ||
				parts[1] ||
				parts[0] ||
				targetProfileId;
		}

		const res = await this.client.request<{
			results?: Array<{
				guid?: string;
				id?: string | number;
				sender?: string | number;
				sender_id?: string | number;
				recipient?: string | number;
				recipient_id?: string | number;
				message?: string;
				message_type?: number;
				created_at?: string | number;
				timestamp?: number;
				image_guid?: string;
				photo_key?: string;
			}>;
		}>({
			account,
			method: "GET",
			path: "/app/chat",
			query: {
				inbox_style: 2,
				keep_unread: 0,
				profile_id: targetProfileId,
			},
			timeoutMs: 12000,
		});

		const list = res.results || [];

		return list.map((m) => {
			const time = m.timestamp
				? m.timestamp > 1e11
					? m.timestamp
					: m.timestamp * 1000
				: m.created_at
					? new Date(m.created_at).getTime()
					: Date.now();
			const senderId = String(m.sender ?? m.sender_id ?? "");
			const recipientId = String(m.recipient ?? m.recipient_id ?? "");
			const isFromMe = Boolean(myId && senderId === myId);
			const mediaKey = m.photo_key || m.image_guid;
			const mediaUrl = mediaKey
				? buildScruffPhotoUrl(mediaKey)
				: undefined;

			return {
				channel: this.channel,
				conversationId,
				id: String(m.guid || m.id || crypto.randomUUID()),
				isFromMe,
				mediaUrl,
				rawPayload: m,
				recipientId,
				senderId,
				status: "delivered",
				text: m.message || "",
				timestamp: time,
			};
		});
	}

	async sendMessage(params: SendMessageParams): Promise<UniversalMessage> {
		const account = await this.ensureAccountProxy(params.account);

		const guid = crypto.randomUUID();
		const requestGuid = crypto.randomUUID();

		try {
			await this.client.request({
				account,
				body: {
					guid,
					media_behavior: 0,
					message: params.text,
					message_type: 1,
					recipient: params.targetUserId,
					request_guid: requestGuid,
				},
				method: "POST",
				path: "/app/chat",
				timeoutMs: 15000,
			});
		} catch (err) {
			console.warn(
				"Upstream chat dispatch warning, retaining optimistic sent state:",
				err,
			);
		}

		const metaId = account?.extraMeta?.profileId;
		const myId =
			typeof metaId === "string" || typeof metaId === "number"
				? String(metaId)
				: account?.accountIdentifier || "me";

		return {
			channel: this.channel,
			conversationId: params.conversationId || params.targetUserId,
			id: guid,
			isFromMe: true,
			recipientId: params.targetUserId,
			senderId: myId,
			status: "sent",
			text: params.text,
			timestamp: Date.now(),
		};
	}

	abstract sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult>;

	async verifyAccount(account: ChannelAccount): Promise<VerifyAccountResult> {
		return verifyScruffAccount(this.client, this.channel, account);
	}
}

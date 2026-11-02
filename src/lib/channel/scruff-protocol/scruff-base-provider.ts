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
	type UniversalPhoto,
	type UniversalSocialLink,
	type UniversalUserProfile,
} from "../types";
import { RelayClient } from "./relay-client";
import {
	BODY_HAIR_LABELS,
	buildScruffPhotoUrl,
	COMMUNITY_LABELS,
	ETHNICITY_LABELS,
	RELATIONSHIP_STATUS_LABELS,
	SEX_PREFERENCE_LABELS,
	SOCIAL_SERVICES,
} from "./scruff-options";

export interface RawScruffProfile {
	id: number | string;
	name?: string;
	age?: number;
	about?: string;
	avatar_thumbnail_key?: string;
	avatar_fullsize_key?: string;
	profile_photos?: Array<{
		id?: string | number;
		thumbnail_key?: string;
		fullsize_key?: string;
	}>;
	distance?: number;
	logged_in?: boolean;
	last_active?: number | string;
	height?: number;
	weight_kg?: number;
	ethnicity?: number;
	body_hair?: number;
	sex_preferences?: number;
	relationship_status?: number;
	community?: number[];
	community_interests?: number[];
	hashtags?: string[];
	urls?: Array<{ service: number; url: string }>;
}

export abstract class ScruffProtocolBaseProvider implements SocialChannelProvider {
	abstract readonly channel: SocialChannelType;
	abstract readonly meta: ChannelMeta;
	protected readonly client: RelayClient;

	constructor(platform: "scruff" | "jackd") {
		this.client = new RelayClient({ platform });
	}

	async getNearbyUsers(
		params: NearbyQueryParams,
	): Promise<PageResult<UniversalGridUser>> {
		const offset = params.offset ?? 0;
		const query: Record<string, unknown> = {
			latitude: params.lat,
			longitude: params.lon,
			offset,
			limit: 1000,
			device_type: 1,
			query_sort_type: 3,
			thumbnail_constraint: "-thumbnail-300",
			fullsize_constraint: "-fullsize-400K",
		};

		if (params.filterTags && params.filterTags.length > 0) {
			query.hashtags = JSON.stringify(params.filterTags);
		}

		const res = await this.client.request<{
			results?: RawScruffProfile[];
			data?: RawScruffProfile[];
		}>({
			path: "/app/location",
			method: "GET",
			query,
			account: params.account,
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

		// Offset advances by 100 per query in Scruff relay protocol
		const nextOffset = rawList.length > 0 ? offset + 100 : undefined;

		return {
			items,
			offset,
			nextOffset,
			hasNext: rawList.length > 0,
			total: items.length,
		};
	}

	async getUserDetail(
		userId: string,
		account?: ChannelAccount,
	): Promise<UniversalUserProfile> {
		const res = await this.client.request<{
			results?: RawScruffProfile[];
			data?: RawScruffProfile[];
		}>({
			path: "/app/profile",
			method: "GET",
			query: {
				target: userId,
				api_version: 2,
				thumbnail_constraint: "-thumbnail-300",
				fullsize_constraint: "-fullsize-400K",
			},
			account,
		});

		const list = res.results || res.data || [];
		const p = list[0];
		if (!p) {
			throw new Error(`${this.meta.name} profile not found: ${userId}`);
		}

		const photos: UniversalPhoto[] = [];
		if (p.profile_photos && Array.isArray(p.profile_photos)) {
			for (const ph of p.profile_photos) {
				const thumb = buildScruffPhotoUrl(
					ph.thumbnail_key,
					"thumbnail",
				);
				const full = buildScruffPhotoUrl(ph.fullsize_key, "fullsize");
				if (thumb || full) {
					photos.push({
						id: String(ph.id || ph.thumbnail_key),
						thumbnailUrl: thumb,
						fullsizeUrl: full || thumb,
					});
				}
			}
		}

		if (
			photos.length === 0 &&
			(p.avatar_thumbnail_key || p.avatar_fullsize_key)
		) {
			const thumb = buildScruffPhotoUrl(
				p.avatar_thumbnail_key,
				"thumbnail",
			);
			const full = buildScruffPhotoUrl(
				p.avatar_fullsize_key || p.avatar_thumbnail_key,
				"fullsize",
			);
			photos.push({
				thumbnailUrl: thumb,
				fullsizeUrl: full,
				isAvatar: true,
			});
		}

		const socialLinks: UniversalSocialLink[] = [];
		if (p.urls && Array.isArray(p.urls)) {
			for (const u of p.urls) {
				const opt = SOCIAL_SERVICES[u.service];
				if (opt && u.url) {
					const clean = u.url.replace(/^@/, "");
					const href = /^https?:\/\//i.test(clean)
						? clean
						: `${opt.baseUrl}${encodeURIComponent(clean)}`;
					socialLinks.push({
						service: opt.label.toLowerCase(),
						label: opt.label,
						url: href,
					});
				}
			}
		}

		const communityTags: string[] = [];
		if (p.community && Array.isArray(p.community)) {
			for (const cId of p.community) {
				const label = COMMUNITY_LABELS[cId];
				if (label) communityTags.push(label);
			}
		}

		const ethnicity =
			p.ethnicity && ETHNICITY_LABELS[p.ethnicity]
				? ETHNICITY_LABELS[p.ethnicity]
				: undefined;
		const bodyHair =
			p.body_hair && BODY_HAIR_LABELS[p.body_hair]
				? BODY_HAIR_LABELS[p.body_hair]
				: undefined;
		const rolePreference =
			p.sex_preferences && SEX_PREFERENCE_LABELS[p.sex_preferences]
				? SEX_PREFERENCE_LABELS[p.sex_preferences]
				: undefined;
		const relationshipStatus =
			p.relationship_status &&
			RELATIONSHIP_STATUS_LABELS[p.relationship_status]
				? RELATIONSHIP_STATUS_LABELS[p.relationship_status]
				: undefined;

		return {
			channel: this.channel,
			id: String(p.id),
			displayName: p.name || `User ${p.id}`,
			age: p.age,
			about: p.about || undefined,
			photos,
			distanceMeters:
				p.distance !== undefined ? Math.round(p.distance * 1000) : null,
			distanceText:
				p.distance !== undefined
					? `${p.distance.toFixed(1)} km`
					: undefined,
			isOnline: Boolean(p.logged_in),
			heightCm: p.height,
			weightKg: p.weight_kg,
			ethnicity,
			bodyHair,
			rolePreference,
			relationshipStatus,
			communityTags,
			socialLinks,
			rawPayload: p,
		};
	}

	async getConversations(
		params?: ConversationQueryParams,
	): Promise<PageResult<UniversalConversation>> {
		const res = await this.client.request<{
			data?: Array<{
				conversation_id?: string;
				target?: string;
				target_name?: string;
				target_avatar_url?: string;
				last_message?: string;
				last_message_at?: number | string;
				unread_count?: number;
			}>;
		}>({
			path: "/_private/im/conversations",
			method: "GET",
			query: {
				platform: this.client.platform,
				user: params?.account?.accountIdentifier,
			},
			account: params?.account,
		});

		const list = res.data || [];
		const items: UniversalConversation[] = list.map((c) => ({
			channel: this.channel,
			conversationId: c.conversation_id || String(c.target),
			targetUserId: String(c.target),
			targetUserName: c.target_name || `User ${c.target}`,
			targetAvatarUrl: c.target_avatar_url,
			lastMessageText: c.last_message || "",
			lastMessageTimestamp: c.last_message_at
				? new Date(c.last_message_at).getTime()
				: 0,
			unreadCount: c.unread_count ?? 0,
			rawPayload: c,
		}));

		return {
			items,
			offset: params?.offset ?? 0,
			hasNext: false,
			total: items.length,
		};
	}

	async getMessages(
		conversationId: string,
		params?: MessageQueryParams,
	): Promise<UniversalMessage[]> {
		const res = await this.client.request<{
			results?: Array<{
				guid: string;
				sender_id: string | number;
				recipient_id: string | number;
				message: string;
				created_at: string | number;
			}>;
		}>({
			path: "/app/chat",
			method: "GET",
			query: {
				profile_id: conversationId,
				inbox_style: 2,
				keep_unread: 0,
			},
			account: params?.account,
		});

		const list = res.results || [];
		return list.map((m) => {
			const time = m.created_at ? new Date(m.created_at).getTime() : 0;
			return {
				channel: this.channel,
				id: m.guid,
				conversationId,
				senderId: String(m.sender_id),
				recipientId: String(m.recipient_id),
				isFromMe:
					params?.account?.accountIdentifier === String(m.sender_id),
				text: m.message,
				timestamp: time,
				rawPayload: m,
			};
		});
	}

	async sendMessage(params: SendMessageParams): Promise<UniversalMessage> {
		const guid = crypto.randomUUID();
		const requestGuid = crypto.randomUUID();

		await this.client.request({
			path: "/app/chat",
			method: "POST",
			body: {
				recipient: params.targetUserId,
				message: params.text,
				message_type: 1,
				media_behavior: 0,
				guid,
				request_guid: requestGuid,
			},
			account: params.account,
		});

		return {
			channel: this.channel,
			id: guid,
			conversationId: params.conversationId || params.targetUserId,
			senderId: params.account?.accountIdentifier || "me",
			recipientId: params.targetUserId,
			isFromMe: true,
			text: params.text,
			timestamp: Date.now(),
			status: "sent",
		};
	}

	abstract sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult>;

	async verifyAccount(account: ChannelAccount): Promise<VerifyAccountResult> {
		try {
			let profileId = account.extraMeta?.profileId as string | undefined;
			let effectiveProxy = account.proxyUrl;

			// 1. 优先尝试从平台账号管理中心同步账号元信息（平台用户ID、专属代理）
			try {
				const platformRes = await this.client.request<{
					data?: {
						account?: string;
						id?: number;
						platformUserId?: string;
						proxyUrl?: string;
					};
					ret?: boolean;
				}>({
					headers: { "omni-platform": this.channel },
					method: "GET",
					path: `https://omni-api.toonhub.top/platform/accounts/${this.channel}/${encodeURIComponent(account.accountIdentifier)}`,
					timeoutMs: 8000,
				});

				if (platformRes.ret && platformRes.data) {
					if (!profileId && platformRes.data.platformUserId) {
						profileId = String(platformRes.data.platformUserId);
					}
					if (!effectiveProxy && platformRes.data.proxyUrl) {
						effectiveProxy = platformRes.data.proxyUrl;
					}
				}
			} catch {
				// 平台中心未录入或离线时，平滑降级
			}

			const verifiedAccount: ChannelAccount = {
				...account,
				proxyUrl: effectiveProxy,
			};

			// 2. 若已知 profileId，直接请求个人全量资料验证
			if (profileId) {
				try {
					const profileRes = await this.client.request<{
						results?: RawScruffProfile[];
					}>({
						account: verifiedAccount,
						method: "GET",
						path: "/app/profile",
						query: { api_version: 2, target: profileId },
						timeoutMs: 12000,
					});

					const p = profileRes.results?.[0];
					if (p) {
						const thumbKey =
							p.avatar_thumbnail_key ||
							p.profile_photos?.[0]?.thumbnail_key;
						const avatarUrl = buildScruffPhotoUrl(
							thumbKey,
							"thumbnail",
						);
						return {
							avatarUrl,
							displayName: p.name || account.accountIdentifier,
							profileId: String(p.id),
							proxyUrl: effectiveProxy,
							rawPayload: p,
							valid: true,
						};
					}
				} catch {
					// 个人资料拉取失败时尝试通过附近网格探测
				}
			}

			// 3. 通用探测：通过附近检索确认会话有效性并探知自身账号信息
			const locationRes = await this.client.request<{
				results?: RawScruffProfile[];
			}>({
				account: verifiedAccount,
				method: "GET",
				path: "/app/location",
				query: { latitude: 0, limit: 5, longitude: 0, offset: 0 },
				timeoutMs: 12000,
			});

			const first = locationRes.results?.[0];
			if (first) {
				const thumbKey =
					first.avatar_thumbnail_key ||
					first.profile_photos?.[0]?.thumbnail_key;
				const avatarUrl = buildScruffPhotoUrl(thumbKey, "thumbnail");
				return {
					avatarUrl,
					displayName: first.name || account.accountIdentifier,
					profileId: String(first.id),
					proxyUrl: effectiveProxy,
					rawPayload: first,
					valid: true,
				};
			}

			return {
				displayName: account.name || account.accountIdentifier,
				proxyUrl: effectiveProxy,
				valid: true,
			};
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			return { errorMessage: errMsg, valid: false };
		}
	}
}

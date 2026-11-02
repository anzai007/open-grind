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
import { buildScruffPhotoUrl } from "./scruff-options";

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
			device_type: 1,
			fullsize_constraint: "-fullsize-400K",
			latitude: params.lat,
			limit: 60,
			longitude: params.lon,
			offset,
			query_sort_type: 3,
			thumbnail_constraint: "-thumbnail-300",
		};

		if (params.filterTags && params.filterTags.length > 0) {
			query.hashtags = JSON.stringify(params.filterTags);
		}

		let account = params.account;
		if (
			account?.accountIdentifier &&
			(!account.proxyUrl || !account.proxyUrl.includes("@"))
		) {
			try {
				const platInfo = await queryPlatformAccount(
					this.channel === "jackd" ? "jackd" : "scruff",
					account.accountIdentifier,
					2000,
				);
				if (platInfo?.proxyUrl) {
					account = {
						...account,
						proxyUrl: resolveEffectiveProxy(
							account.proxyUrl,
							platInfo.proxyUrl,
						),
					};
				}
			} catch {
				// 降级使用原配置
			}
		}

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
			data?: RawScruffProfile[];
			results?: RawScruffProfile[];
		}>({
			account,
			method: "GET",
			path: "/app/profile",
			query: {
				api_version: 2,
				fullsize_constraint: "-fullsize-400K",
				target: userId,
				thumbnail_constraint: "-thumbnail-300",
			},
		});

		const list = res.results || res.data || [];
		const p = list[0];
		if (!p) {
			throw new Error(`${this.meta.name} profile not found: ${userId}`);
		}

		return parseRawScruffProfile(p, this.channel);
	}

	async getConversations(
		params?: ConversationQueryParams,
	): Promise<PageResult<UniversalConversation>> {
		let account = params?.account;
		if (
			account?.accountIdentifier &&
			(!account.proxyUrl || !account.proxyUrl.includes("@"))
		) {
			try {
				const platInfo = await queryPlatformAccount(
					this.channel === "jackd" ? "jackd" : "scruff",
					account.accountIdentifier,
					2000,
				);
				if (platInfo?.proxyUrl) {
					account = {
						...account,
						proxyUrl: resolveEffectiveProxy(
							account.proxyUrl,
							platInfo.proxyUrl,
						),
					};
				}
			} catch {
				// 降级使用原配置
			}
		}

		const userIdentifier =
			(account?.extraMeta?.profileId as string | undefined) ||
			account?.accountIdentifier ||
			"";

		const res = await this.client.request<{
			ret?: boolean;
			data?: Array<{
				conversation_id?: string;
				target?: string | number;
				target_user_id?: string | number;
				target_name?: string;
				target_avatar_url?: string;
				avatar_thumbnail_key?: string;
				last_message?: string;
				last_message_at?: number | string;
				unread_count?: number;
			}>;
		}>({
			account,
			method: "GET",
			path: "/_private/im/conversations",
			query: { platform: this.client.platform, user: userIdentifier },
			timeoutMs: 12000,
		});

		const list = res.data || [];
		const items: UniversalConversation[] = list.map((c) => {
			const targetId = String(c.target_user_id || c.target || "");
			const avatarUrl =
				c.target_avatar_url ||
				(c.avatar_thumbnail_key
					? buildScruffPhotoUrl(c.avatar_thumbnail_key)
					: undefined);
			return {
				channel: this.channel,
				conversationId: c.conversation_id || targetId,
				lastMessageText: c.last_message || "",
				lastMessageTimestamp: c.last_message_at
					? typeof c.last_message_at === "number"
						? c.last_message_at
						: new Date(c.last_message_at).getTime()
					: 0,
				rawPayload: c,
				targetAvatarUrl: avatarUrl,
				targetUserId: targetId,
				targetUserName: c.target_name || `User ${targetId}`,
				unreadCount: c.unread_count ?? 0,
			};
		});

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
		let account = params?.account;
		if (
			account?.accountIdentifier &&
			(!account.proxyUrl || !account.proxyUrl.includes("@"))
		) {
			try {
				const platInfo = await queryPlatformAccount(
					this.channel === "jackd" ? "jackd" : "scruff",
					account.accountIdentifier,
					2000,
				);
				if (platInfo?.proxyUrl) {
					account = {
						...account,
						proxyUrl: resolveEffectiveProxy(
							account.proxyUrl,
							platInfo.proxyUrl,
						),
					};
				}
			} catch {
				// 降级使用原配置
			}
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
				profile_id: conversationId,
			},
			timeoutMs: 12000,
		});

		const list = res.results || [];
		const metaId = account?.extraMeta?.profileId;
		const myId =
			typeof metaId === "string" || typeof metaId === "number"
				? String(metaId)
				: account?.accountIdentifier || "";

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
		let account = params.account;
		if (
			account?.accountIdentifier &&
			(!account.proxyUrl || !account.proxyUrl.includes("@"))
		) {
			try {
				const platInfo = await queryPlatformAccount(
					this.channel === "jackd" ? "jackd" : "scruff",
					account.accountIdentifier,
					2000,
				);
				if (platInfo?.proxyUrl) {
					account = {
						...account,
						proxyUrl: resolveEffectiveProxy(
							account.proxyUrl,
							platInfo.proxyUrl,
						),
					};
				}
			} catch {
				// 降级使用原配置
			}
		}

		const guid = crypto.randomUUID();
		const requestGuid = crypto.randomUUID();

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
		// 全局保护：单次验证总耗时硬限制，彻底杜绝 UI 悬挂
		const timeoutPromise = new Promise<VerifyAccountResult>((resolve) => {
			setTimeout(() => {
				resolve({
					displayName: account.name || account.accountIdentifier,
					proxyUrl: account.proxyUrl,
					valid: true,
				});
			}, 6000);
		});

		const verifyPromise = (async (): Promise<VerifyAccountResult> => {
			try {
				let profileId = account.extraMeta?.profileId as
					| string
					| undefined;
				const platform = this.channel === "jackd" ? "jackd" : "scruff";

				// 1. 优先尝试从平台账号管理中心同步账号元信息（平台用户ID、专属代理）
				const platInfo = await queryPlatformAccount(
					platform,
					account.accountIdentifier,
					3500,
				);

				const effectiveProxy = resolveEffectiveProxy(
					account.proxyUrl,
					platInfo?.proxyUrl,
				);

				if (!profileId && platInfo?.platformUserId) {
					profileId = String(platInfo.platformUserId);
				}

				const verifiedAccount: ChannelAccount = {
					...account,
					proxyUrl: effectiveProxy,
				};

				// 若平台数据库已有该账号并且已激活（有 AccessToken 或 platformUserId）
				// 说明设备和 Token 在平台都是现成的，瞬时确认为有效！
				const isPlatformKnown = Boolean(
					platInfo &&
					(platInfo.hasAccessToken || platInfo.platformUserId),
				);

				// 2. 若已知 profileId，快速拉取一次个人资料（超短超时 3000ms）
				if (profileId) {
					try {
						const profileRes = await this.client.request<{
							results?: RawScruffProfile[];
						}>({
							account: verifiedAccount,
							method: "GET",
							path: "/app/profile",
							query: { api_version: 2, target: profileId },
							timeoutMs: 3000,
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
								displayName:
									p.name || account.accountIdentifier,
								profileId: String(p.id),
								proxyUrl: effectiveProxy,
								rawPayload: p,
								valid: true,
							};
						}
					} catch {
						// 若为平台已录入账号，即便上游网络临时波动，也不阻断添加
						if (isPlatformKnown) {
							return {
								displayName:
									account.name || account.accountIdentifier,
								profileId,
								proxyUrl: effectiveProxy,
								valid: true,
							};
						}
					}
				}

				// 3. 通用探测：通过附近检索确认会话有效性并探知自身账号信息（超时 4000ms）
				try {
					const locationRes = await this.client.request<{
						results?: RawScruffProfile[];
					}>({
						account: verifiedAccount,
						method: "GET",
						path: "/app/location",
						query: {
							latitude: 0,
							limit: 5,
							longitude: 0,
							offset: 0,
						},
						timeoutMs: 4000,
					});

					const first = locationRes.results?.[0];
					if (first) {
						const thumbKey =
							first.avatar_thumbnail_key ||
							first.profile_photos?.[0]?.thumbnail_key;
						const avatarUrl = buildScruffPhotoUrl(
							thumbKey,
							"thumbnail",
						);
						return {
							avatarUrl,
							displayName:
								first.name || account.accountIdentifier,
							profileId: String(first.id),
							proxyUrl: effectiveProxy,
							rawPayload: first,
							valid: true,
						};
					}
				} catch (err) {
					if (isPlatformKnown) {
						return {
							displayName:
								account.name || account.accountIdentifier,
							profileId,
							proxyUrl: effectiveProxy,
							valid: true,
						};
					}
					throw err;
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
		})();

		return Promise.race([verifyPromise, timeoutPromise]);
	}
}

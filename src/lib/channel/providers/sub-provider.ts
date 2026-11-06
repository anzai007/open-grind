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
	hydrateSubGridAvatars,
	resolveSubImageDataUrl,
} from "../sub-protocol/sub-image-resolver";
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
		const limit = params.limit ?? 24;
		const page = Math.floor(offset / limit) + 1;
		const account = await this.ensureAccountProxy(params.account);

		const myId =
			(account?.extraMeta?.profileId as string | undefined) ||
			account?.accountIdentifier ||
			"17356066556";

		// 1. 优先调用 Sub 官方中继附近用户 API (sub.nearby_users: /fem/api/appUserNode/findList)
		try {
			const res = await this.client.request<{
				status?: string | number;
				data?: RawSubProfile[];
			}>({
				account,
				headers: {
					Accept: "application/json",
					"omni-account": myId,
					"omni-platform": "sub",
				},
				method: "GET",
				path: "https://omni-relay.toonhub.top/fem/api/appUserNode/findList",
				query: {
					excludeWithOutAvatar: 1,
					hideNearby: 0,
					lat: params.lat,
					lng: params.lon,
					pageNo: page,
					pageSize: limit,
				},
				timeoutMs: 6000,
			});

			const rawList: RawSubProfile[] = Array.isArray(res.data)
				? res.data
				: Array.isArray(
							(
								res.data as unknown as {
									records?: RawSubProfile[];
								}
							)?.records,
					  )
					? (res.data as unknown as { records: RawSubProfile[] })
							.records
					: Array.isArray(
								(
									res.data as unknown as {
										list?: RawSubProfile[];
									}
								)?.list,
						  )
						? (res.data as unknown as { list: RawSubProfile[] })
								.list
						: [];
			if (rawList.length > 0) {
				const items: UniversalGridUser[] =
					rawList.map(parseSubGridUser);
				await hydrateSubGridAvatars(items);
				const hasNext = items.length >= limit;
				const total = offset + items.length + (hasNext ? limit : 0);

				return {
					hasNext,
					items,
					nextOffset: hasNext ? offset + items.length : undefined,
					offset,
					total,
				};
			}
		} catch (err) {
			console.warn(
				"Sub findList nearby API failed, trying fallback:",
				err,
			);
		}

		// 2. 降级方案 A：从本地/自建 ai-growth 用户池服务拉取候选用户
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
				await hydrateSubGridAvatars(items);
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
			// ai-growth 用户池不可达时继续降级
		}

		// 3. 降级方案 B：从中继已登记的平台账号与最近会话伙伴中提取候选人
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

		// 4. 从已有会话列表中提取活跃联系人
		const activeConvId =
			(account?.extraMeta?.profileId as string | undefined) ||
			account?.accountIdentifier ||
			"";

		if (activeConvId) {
			try {
				const convsRes = await this.client.request<{
					ret?: boolean;
					data?: Array<Record<string, unknown>>;
				}>({
					account,
					method: "GET",
					path: "/_private/im/conversations",
					query: { platform: "sub", user: activeConvId },
					timeoutMs: 4000,
				});

				const list = convsRes.data || [];
				for (const c of list) {
					const targetId = resolvePartnerProfileId(c, activeConvId);
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
		const myId =
			(effAccount?.extraMeta?.profileId as string | undefined) ||
			effAccount?.accountIdentifier ||
			"17356066556";

		// 1. 优先调用 Sub 官方中继用户详情接口 (sub.user_info: /fem/api/appUser/appUserInfo)
		try {
			const res = await this.client.request<{
				status?: string | number;
				data?: RawSubProfile | RawSubProfile[];
			}>({
				account: effAccount,
				headers: {
					Accept: "application/json",
					"omni-account": myId,
					"omni-platform": "sub",
				},
				method: "GET",
				path: `https://omni-relay.toonhub.top/fem/api/appUser/appUserInfo?appUserId=${encodeURIComponent(userId)}`,
				timeoutMs: 5000,
			});

			const p = Array.isArray(res.data) ? res.data[0] : res.data;
			if (p && (p.userName || p.avatar || p.id || p.userId)) {
				const parsed = parseRawSubProfile(p);

				// 异步尝试从相册补齐更多照片 (sub.private_albums)
				try {
					const photoRes = await this.client.request<{
						data?: Array<{
							file?: {
								webAddr?: string;
								saveAddr?: string;
								miniImageUrl?: string;
							};
							isAvatar?: string | number;
						}>;
					}>({
						account: effAccount,
						headers: {
							Accept: "application/json",
							"omni-account": myId,
							"omni-platform": "sub",
						},
						method: "GET",
						path: `https://omni-relay.toonhub.top/fem/api/appUserPhoto/findList?pageNo=1&pageSize=20&userId=${encodeURIComponent(userId)}`,
						timeoutMs: 3000,
					});

					const photosList = photoRes.data || [];
					for (const item of photosList) {
						const f = item.file;
						const addr =
							f?.webAddr || f?.saveAddr || f?.miniImageUrl;
						if (addr) {
							const fullUrl = subMediaUrl(addr);
							if (
								fullUrl &&
								!parsed.photos.some(
									(ph) => ph.fullsizeUrl === fullUrl,
								)
							) {
								parsed.photos.push({
									fullsizeUrl: fullUrl,
									isAvatar:
										item.isAvatar === "1" ||
										item.isAvatar === 1,
									thumbnailUrl: fullUrl,
								});
							}
						}
					}
				} catch {
					// 相册非关键链路，忽略异常
				}

				// 预解析相册照片为 Data URL 避免 WebKit 拦截
				await Promise.allSettled(
					parsed.photos.map(async (photo) => {
						if (
							photo.thumbnailUrl?.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							photo.thumbnailUrl = await resolveSubImageDataUrl(
								photo.thumbnailUrl,
							);
						}
						if (
							photo.fullsizeUrl?.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							photo.fullsizeUrl = await resolveSubImageDataUrl(
								photo.fullsizeUrl,
							);
						}
					}),
				);

				this.profileDetailCache.set(userId, {
					expiresAt: Date.now() + 15 * 60 * 1000,
					profile: parsed,
				});
				return parsed;
			}
		} catch (err) {
			console.warn(
				"Sub appUserInfo failed, trying cache or ai-growth:",
				err,
			);
		}

		// 2. 降级方案 A：从缓存接口快速获取 (sub.user_info_cache: /fem/api/appUser/cacheAppUserInfo)
		try {
			const cacheRes = await this.client.request<{
				status?: string | number;
				data?: RawSubProfile | RawSubProfile[];
			}>({
				account: effAccount,
				headers: {
					Accept: "application/json",
					"omni-account": myId,
					"omni-platform": "sub",
				},
				method: "GET",
				path: `https://omni-relay.toonhub.top/fem/api/appUser/cacheAppUserInfo?appUserId=${encodeURIComponent(userId)}`,
				timeoutMs: 4000,
			});

			const p = Array.isArray(cacheRes.data)
				? cacheRes.data[0]
				: cacheRes.data;
			if (p && (p.userName || p.avatar || p.id || p.userId)) {
				const parsed = parseRawSubProfile(p);
				// 预解析相册照片为 Data URL 避免 WebKit 拦截
				await Promise.allSettled(
					parsed.photos.map(async (photo) => {
						if (
							photo.thumbnailUrl?.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							photo.thumbnailUrl = await resolveSubImageDataUrl(
								photo.thumbnailUrl,
							);
						}
						if (
							photo.fullsizeUrl?.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							photo.fullsizeUrl = await resolveSubImageDataUrl(
								photo.fullsizeUrl,
							);
						}
					}),
				);

				this.profileDetailCache.set(userId, {
					expiresAt: Date.now() + 15 * 60 * 1000,
					profile: parsed,
				});
				return parsed;
			}
		} catch {
			// ignore
		}

		// 3. 降级方案 B：从本地/自建 ai-growth 接口查询详情
		try {
			const res = await this.client.request<{
				code?: number;
				data?: RawSubProfile | RawSubProfile[];
			}>({
				account: effAccount,
				method: "GET",
				path: `/_ai_growth_api/api/social-touch/sub/user-pool/${encodeURIComponent(userId)}`,
				timeoutMs: 4000,
			});

			const p = Array.isArray(res.data) ? res.data[0] : res.data;
			if (p) {
				const parsed = parseRawSubProfile(p);
				// 预解析相册照片为 Data URL 避免 WebKit 拦截
				await Promise.allSettled(
					parsed.photos.map(async (photo) => {
						if (
							photo.thumbnailUrl?.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							photo.thumbnailUrl = await resolveSubImageDataUrl(
								photo.thumbnailUrl,
							);
						}
						if (
							photo.fullsizeUrl?.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							photo.fullsizeUrl = await resolveSubImageDataUrl(
								photo.fullsizeUrl,
							);
						}
					}),
				);

				this.profileDetailCache.set(userId, {
					expiresAt: Date.now() + 15 * 60 * 1000,
					profile: parsed,
				});
				return parsed;
			}
		} catch {
			// 降级使用基础档案
		}

		// 4. 兜底生成基础资料对象
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

			const rawConvAvatar =
				(c.target_avatar_url as string) ||
				(c.targetAvatarUrl as string) ||
				(typeof c.avatar === "string" && !/^\d+$/.test(c.avatar.trim())
					? c.avatar
					: undefined);

			const avatarUrl =
				rawConvAvatar ||
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

		await Promise.allSettled(
			items.map(async (conv) => {
				if (
					conv.targetAvatarUrl &&
					conv.targetAvatarUrl.startsWith(
						"https://images.sublifeapp.com/",
					)
				) {
					conv.targetAvatarUrl = await resolveSubImageDataUrl(
						conv.targetAvatarUrl,
					);
				}
			}),
		);

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
		const mediaUrl = params.mediaUrl
			? subMediaUrl(params.mediaUrl)
			: undefined;

		// 1. 优先尝试走 WSS 统一长链模式 (WebSocket messageSend)
		if (relayImWs.connected && myId !== "me") {
			try {
				let wsResult:
					| { messageId?: string; senderTime?: string }
					| undefined;

				if (mediaUrl) {
					wsResult = await relayImWs.sendImageMessage({
						channel: "sub",
						conversationId: params.conversationId,
						imageUrl: mediaUrl,
						sender: myId,
						target: targetUserId,
					});
				} else {
					wsResult = await relayImWs.sendTextMessage({
						channel: "sub",
						conversationId: params.conversationId,
						sender: myId,
						target: targetUserId,
						text: params.text,
					});
				}

				if (wsResult?.messageId) {
					guid = wsResult.messageId;
				}
				if (wsResult?.senderTime) {
					messageTimestamp = new Date(wsResult.senderTime).getTime();
				}
				return {
					channel: this.channel,
					conversationId: params.conversationId || targetUserId,
					id: guid,
					isFromMe: true,
					mediaUrl,
					recipientId: targetUserId,
					senderId: myId,
					status: "sent",
					text: params.text || (mediaUrl ? "[图片]" : ""),
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
			mediaUrl,
			recipientId: targetUserId,
			senderId: myId,
			status: "sent",
			text: params.text || (mediaUrl ? "[图片]" : ""),
			timestamp: messageTimestamp,
		};
	}

	async sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult> {
		const effAccount = await this.ensureAccountProxy(account);
		const myId =
			(effAccount?.extraMeta?.profileId as string | undefined) ||
			effAccount?.accountIdentifier ||
			"17356066556";

		// 1. 调用 Sub 官方中继 喜欢/取消喜欢 接口 (sub.save_relationship: /fem/api/appUserNode/saveRelationship)
		try {
			await this.client.request({
				account: effAccount,
				body: { isLike: "1", targetUserId },
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					"omni-account": myId,
					"omni-platform": "sub",
				},
				method: "POST",
				path: "https://omni-relay.toonhub.top/fem/api/appUserNode/saveRelationship",
				timeoutMs: 5000,
			});
		} catch (err) {
			console.warn("Sub saveRelationship interaction failed:", err);
		}

		// 2. 同时发送打招呼触达消息
		try {
			await this.sendMessage({
				account: effAccount,
				targetUserId,
				text: "你好 👋",
			});
		} catch {
			// ignore
		}

		return {
			interactionType: "say_hi",
			message: "已向对方发送喜欢与打招呼 (Like / Say Hi)",
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
		const effAccount = await this.ensureAccountProxy(account);
		const myId =
			(effAccount?.extraMeta?.profileId as string | undefined) ||
			effAccount?.accountIdentifier ||
			"";

		if (myId) {
			// 1. 尝试从 Sub 官方访客记录接口拉取 (sub.profile_visitors: /fem/api/appAccessRecord/findList)
			try {
				const res = await this.client.request<{
					status?: string | number;
					data?: Array<
						RawSubProfile & {
							appUser?: RawSubProfile;
							visitor?: RawSubProfile;
						}
					>;
				}>({
					account: effAccount,
					headers: {
						Accept: "application/json",
						"omni-account": myId,
						"omni-platform": "sub",
					},
					method: "GET",
					path: `https://omni-relay.toonhub.top/fem/api/appAccessRecord/findList?pageNo=1&pageSize=20&targetUserId=${encodeURIComponent(myId)}`,
					timeoutMs: 4000,
				});

				const rawData = res.data as
					| Array<
							RawSubProfile & {
								appUser?: RawSubProfile;
								visitor?: RawSubProfile;
							}
					  >
					| {
							records?: Array<
								RawSubProfile & {
									appUser?: RawSubProfile;
									visitor?: RawSubProfile;
								}
							>;
							list?: Array<
								RawSubProfile & {
									appUser?: RawSubProfile;
									visitor?: RawSubProfile;
								}
							>;
					  }
					| undefined;

				const list = Array.isArray(rawData)
					? rawData
					: Array.isArray(rawData?.records)
						? rawData.records
						: Array.isArray(rawData?.list)
							? rawData.list
							: [];
				if (list.length > 0) {
					return list.map((item) => {
						const userObj = item.appUser || item.visitor || item;
						return parseSubGridUser(userObj);
					});
				}
			} catch (err) {
				console.warn(
					"Sub profile_visitors failed, falling back to conversations:",
					err,
				);
			}
		}

		// 2. 降级从活跃会话中拉取访客/联系人
		try {
			const res = await this.getConversations({ account: effAccount });
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

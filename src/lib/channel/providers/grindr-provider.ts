import { getCascadeV4 } from "$lib/api/browse/grid";
import { signedInProfileId } from "$lib/api/current-session";
import { sendTap } from "$lib/api/interest/taps";
import { getConversations } from "$lib/api/messaging/conversations";
import {
	getConversationMessages,
	sendMessage as sendGrindrRestMessage,
} from "$lib/api/messaging/messages";
import { getProfile } from "$lib/api/users/profiles";
import { encodeGeohash } from "$lib/model/geohash";
import { TapType } from "$lib/model/interest/taps";
import { previewLabel } from "$lib/model/messaging/message-preview";
import { sexualPositions } from "$lib/model/users/profiles";
import { profileMediaUrl } from "$lib/util/media";
import type {
	ConversationQueryParams,
	MessageQueryParams,
	NearbyQueryParams,
	SendMessageParams,
	SocialChannelProvider,
	VerifyAccountResult,
} from "../provider";
import { relayImWs } from "../scruff-protocol/relay-im-ws.svelte";
import {
	CHANNEL_METAS,
	type ChannelMeta,
	type PageResult,
	type UniversalConversation,
	type UniversalGridUser,
	type UniversalInteractionResult,
	type UniversalMessage,
	type UniversalPhoto,
	type UniversalSocialLink,
	type UniversalUserProfile,
} from "../types";

export class GrindrProvider implements SocialChannelProvider {
	readonly channel = "grindr" as const;
	readonly meta: ChannelMeta = CHANNEL_METAS.grindr;

	async getNearbyUsers(
		params: NearbyQueryParams,
	): Promise<PageResult<UniversalGridUser>> {
		const geohash = encodeGeohash({ lat: params.lat, lon: params.lon });
		const cascade = await getCascadeV4({ nearbyGeoHash: geohash });

		const items: UniversalGridUser[] = [];
		const now = Date.now();

		for (const entry of cascade.items) {
			if (entry.type === "full_profile_v1") {
				const p = entry.data;
				const avatarUrl = p.primaryImageUrl || "";
				const isOnline = p.onlineUntil ? p.onlineUntil > now : false;

				items.push({
					channel: "grindr",
					id: String(p.profileId),
					displayName: p.displayName || `User ${p.profileId}`,
					age: p.age,
					avatarThumbnailUrl: avatarUrl,
					avatarFullUrl: avatarUrl,
					distanceMeters: p.distanceMeters ?? undefined,
					distanceText:
						p.distanceMeters !== null &&
						p.distanceMeters !== undefined
							? `${(p.distanceMeters / 1000).toFixed(1)} km`
							: undefined,
					isOnline,
					isFavorite: Boolean(p.favorite),
					unreadCount: 0,
					headline: undefined,
					tags: [],
					rawPayload: p,
				});
			}
		}

		return {
			items,
			offset: params.offset ?? 0,
			nextOffset: (params.offset ?? 0) + items.length,
			hasNext: items.length > 0,
			total: items.length,
		};
	}

	async getUserDetail(userId: string): Promise<UniversalUserProfile> {
		const numId = Number(userId);
		if (isNaN(numId)) {
			throw new Error(`Invalid Grindr profile ID: ${userId}`);
		}

		const profile = await getProfile(numId);
		if (!profile) {
			throw new Error(`Grindr profile not found: ${userId}`);
		}

		const photos: UniversalPhoto[] = [];
		if (profile.profileImageMediaHash) {
			photos.push({
				id: profile.profileImageMediaHash,
				thumbnailUrl: profileMediaUrl({
					mediaHash: profile.profileImageMediaHash,
					size: "thumb",
				}),
				fullsizeUrl: profileMediaUrl({
					mediaHash: profile.profileImageMediaHash,
					size: "full",
				}),
				isAvatar: true,
			});
		}

		if (profile.medias) {
			for (const media of profile.medias) {
				if (media.mediaHash !== profile.profileImageMediaHash) {
					photos.push({
						id: media.mediaHash,
						thumbnailUrl: profileMediaUrl({
							mediaHash: media.mediaHash,
							size: "thumb",
						}),
						fullsizeUrl: profileMediaUrl({
							mediaHash: media.mediaHash,
							size: "full",
						}),
						isAvatar: false,
					});
				}
			}
		}

		const socialLinks: UniversalSocialLink[] = [];
		if (profile.socialNetworks) {
			for (const [net, handle] of Object.entries(
				profile.socialNetworks,
			)) {
				const urlStr =
					typeof handle === "string"
						? handle
						: typeof handle === "number"
							? String(handle)
							: "";
				if (urlStr) {
					socialLinks.push({
						service: net.toLowerCase(),
						label: net,
						url: urlStr,
					});
				}
			}
		}

		let rolePreference: string | undefined;
		if (
			profile.sexualPosition &&
			profile.sexualPosition in sexualPositions
		) {
			const posKey =
				profile.sexualPosition as keyof typeof sexualPositions;
			rolePreference = sexualPositions[posKey];
		}

		const isOnline = profile.onlineUntil
			? profile.onlineUntil > Date.now()
			: false;

		return {
			channel: "grindr",
			id: String(profile.profileId),
			displayName: profile.displayName || `User ${profile.profileId}`,
			age: profile.age,
			about: profile.aboutMe || undefined,
			photos,
			distanceMeters: profile.distance,
			distanceText:
				profile.distance !== null && profile.distance !== undefined
					? `${(profile.distance / 1000).toFixed(1)} km`
					: undefined,
			isOnline,
			heightCm: profile.height,
			weightKg: profile.weight,
			ethnicity: profile.ethnicity?.toString(),
			bodyHair: undefined,
			rolePreference,
			relationshipStatus: profile.relationshipStatus?.toString(),
			communityTags: profile.grindrTribes?.map(String) ?? [],
			socialLinks,
			rawPayload: profile,
		};
	}

	async getConversations(
		params?: ConversationQueryParams,
	): Promise<PageResult<UniversalConversation>> {
		const page = Math.floor((params?.offset ?? 0) / 20) + 1;
		const response = await getConversations({ page });
		const myId = await signedInProfileId();

		const items: UniversalConversation[] = [];
		for (const entry of response.entries) {
			if (
				entry.type === "full_conversation_v1" ||
				entry.type === "partial_conversation_v1"
			) {
				const conv = entry.data;
				const other =
					conv.participants.find(
						(p) => myId === null || p.profileId !== myId,
					) || conv.participants[0];
				const lastText =
					previewLabel(conv.preview) || conv.preview?.text || "";

				items.push({
					channel: "grindr",
					conversationId: conv.conversationId,
					targetUserId: other ? String(other.profileId) : "",
					targetUserName:
						conv.name || (other ? `User ${other.profileId}` : ""),
					targetAvatarUrl: other?.primaryMediaHash
						? profileMediaUrl({
								mediaHash: other.primaryMediaHash,
								size: "thumb",
							})
						: undefined,
					lastMessageText: lastText,
					lastMessageTimestamp: conv.lastActivityTimestamp || 0,
					unreadCount: conv.unreadCount ?? 0,
					rawPayload: conv,
				});
			}
		}

		return {
			items,
			offset: params?.offset ?? 0,
			nextOffset: response.nextPage ? response.nextPage * 20 : undefined,
			hasNext: response.nextPage !== null,
		};
	}

	async getMessages(
		conversationId: string,
		params?: MessageQueryParams,
	): Promise<UniversalMessage[]> {
		const response = await getConversationMessages({
			conversationId,
			pageKey: params?.beforeId,
		});

		const myId = await signedInProfileId();
		return response.messages.map((m) => {
			let text: string;
			let mediaUrl: string | undefined;

			if (m.type === "Text") {
				text = m.body.text;
			} else if (m.type === "Image") {
				text = "[图片]";
				if (m.body.imageHash) {
					mediaUrl = profileMediaUrl({
						mediaHash: m.body.imageHash,
						size: "thumb",
					});
				}
			} else if (m.type === "Album") {
				text = "[相册]";
			} else if (m.type === "Audio") {
				text = "[语音]";
			} else if (m.type === "Location") {
				text = "[位置]";
			} else {
				const bodyObj = m.body as Record<string, unknown> | null;
				text =
					typeof bodyObj?.text === "string"
						? bodyObj.text
						: `[${m.type}]`;
			}

			return {
				channel: "grindr",
				id: m.messageId,
				conversationId,
				senderId: String(m.senderId),
				recipientId: "",
				isFromMe: myId ? m.senderId === myId : false,
				text,
				mediaUrl,
				timestamp: m.timestamp,
				rawPayload: m,
			};
		});
	}

	async sendMessage(params: SendMessageParams): Promise<UniversalMessage> {
		const myProfileId = await signedInProfileId();
		const myIdStr = myProfileId ? String(myProfileId) : "me";
		const targetId = params.targetUserId;

		// 1. 优先走统一 WSS 长链
		if (relayImWs.connected && relayImWs.activePlatform === "grindr") {
			try {
				const res = await relayImWs.sendTextMessage({
					channel: "grindr",
					sender: myIdStr,
					target: targetId,
					text: params.text,
					conversationId: params.conversationId,
				});
				return {
					channel: "grindr",
					id: res.messageId,
					conversationId:
						params.conversationId || res.conversationId || "",
					senderId: myIdStr,
					recipientId: targetId,
					isFromMe: true,
					text: params.text,
					timestamp: Date.parse(res.senderTime) || Date.now(),
					status: "sent",
				};
			} catch (wsErr) {
				console.warn(
					"[GrindrProvider] WSS send failed, trying HTTP fallback:",
					wsErr,
				);
			}
		}

		// 2. 回退走 Grindr 官方 HTTP 发信接口
		const targetNum = Number(targetId);
		if (!isNaN(targetNum) && targetNum > 0) {
			const sent = await sendGrindrRestMessage({
				toUserId: targetNum,
				message: { type: "Text", body: { text: params.text } },
			});
			return {
				channel: "grindr",
				id: sent.messageId,
				conversationId: sent.conversationId,
				senderId: String(sent.senderId),
				recipientId: targetId,
				isFromMe: true,
				text: params.text,
				timestamp: sent.timestamp,
				status: "sent",
				rawPayload: sent,
			};
		}

		throw new Error(`Invalid target user ID for Grindr: ${targetId}`);
	}

	async sendInteraction(
		targetUserId: string,
	): Promise<UniversalInteractionResult> {
		const numId = Number(targetUserId);
		if (isNaN(numId)) {
			throw new Error(`Invalid target user ID: ${targetUserId}`);
		}

		await sendTap({ recipientId: numId, tapType: TapType.Friendly });

		return {
			success: true,
			interactionType: "tap",
			message: "已向对方发送 Tap",
			targetUserId,
		};
	}

	async verifyAccount(): Promise<VerifyAccountResult> {
		try {
			const profileId = await signedInProfileId();
			if (profileId) {
				return {
					valid: true,
					profileId: String(profileId),
					displayName: `Grindr Profile ${profileId}`,
				};
			}
			return {
				valid: false,
				errorMessage: "No active Grindr session found",
			};
		} catch (e) {
			return {
				valid: false,
				errorMessage: e instanceof Error ? e.message : String(e),
			};
		}
	}
}

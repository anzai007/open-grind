import { getCascadeV4 } from "$lib/api/browse/grid";
import { signedInProfileId } from "$lib/api/current-session";
import { sendTap } from "$lib/api/interest/taps";
import { getConversations } from "$lib/api/messaging/conversations";
import { getConversationMessages } from "$lib/api/messaging/messages";
import { getProfiles } from "$lib/api/users/profiles";
import { encodeGeohash } from "$lib/model/geohash";
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
			if (entry.type === "fullProfile") {
				const p = entry.data;
				const avatarThumbnail = p.profileImageMediaHash
					? profileMediaUrl({
							mediaHash: p.profileImageMediaHash,
							size: "thumb",
						})
					: "";
				const avatarFull = p.profileImageMediaHash
					? profileMediaUrl({
							mediaHash: p.profileImageMediaHash,
							size: "full",
						})
					: "";

				const isOnline = p.onlineUntil ? p.onlineUntil > now : false;

				items.push({
					channel: "grindr",
					id: String(p.profileId),
					displayName: p.displayName || `User ${p.profileId}`,
					age: p.age,
					avatarThumbnailUrl: avatarThumbnail,
					avatarFullUrl: avatarFull,
					distanceMeters: p.distance,
					distanceText:
						p.distance !== null && p.distance !== undefined
							? `${(p.distance / 1000).toFixed(1)} km`
							: undefined,
					isOnline,
					isFavorite: Boolean(p.isFavorite),
					unreadCount: p.unreadCount ?? 0,
					headline: p.aboutMe || undefined,
					tags: p.profileTags ?? [],
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

		const profiles = await getProfiles([numId]);
		const profile = profiles[0];
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

		const items: UniversalConversation[] = [];
		for (const entry of response.entries) {
			if (entry.type === "conversation") {
				const conv = entry.data;
				items.push({
					channel: "grindr",
					conversationId: conv.conversationId,
					targetUserId: String(conv.recipientProfileId),
					targetUserName:
						conv.name || `User ${conv.recipientProfileId}`,
					targetAvatarUrl: conv.previewImageMediaHash
						? profileMediaUrl({
								mediaHash: conv.previewImageMediaHash,
								size: "thumb",
							})
						: undefined,
					lastMessageText: conv.lastMessage?.text || "",
					lastMessageTimestamp: conv.lastMessage?.timestamp || 0,
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

		return response.messages.map((m) => ({
			channel: "grindr",
			id: m.messageId,
			conversationId,
			senderId: String(m.senderProfileId),
			recipientId: String(m.recipientProfileId),
			isFromMe: false, // In practice, determined by comparing with current user id
			text: m.body?.text || "",
			mediaUrl: m.body?.type === "image" ? m.body.url : undefined,
			timestamp: m.timestamp,
			rawPayload: m,
		}));
	}

	async sendMessage(params: SendMessageParams): Promise<UniversalMessage> {
		// Basic stub for message send (calls WebSocket or HTTP chat send)
		await Promise.resolve();
		const now = Date.now();
		return {
			channel: "grindr",
			id: `grindr-msg-${now}`,
			conversationId: params.conversationId || "",
			senderId: "me",
			recipientId: params.targetUserId,
			isFromMe: true,
			text: params.text,
			timestamp: now,
			status: "sent",
		};
	}

	async sendInteraction(
		targetUserId: string,
	): Promise<UniversalInteractionResult> {
		const numId = Number(targetUserId);
		if (isNaN(numId)) {
			throw new Error(`Invalid target user ID: ${targetUserId}`);
		}

		await sendTap({ recipientId: numId, tapType: "Friendly" });

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

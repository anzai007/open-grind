export type SocialChannelType = "grindr" | "scruff" | "jackd";

export interface ChannelMeta {
	type: SocialChannelType;
	name: string;
	shortName: string;
	brandColor: string;
	brandForeground: string;
	interactionName: string; // Grindr: Tap, Scruff: Woof, Jack'd: Wave
	iconName: string;
}

export const CHANNEL_METAS: Record<SocialChannelType, ChannelMeta> = {
	grindr: {
		type: "grindr",
		name: "Grindr",
		shortName: "Grindr",
		brandColor: "#ffc700",
		brandForeground: "#000000",
		interactionName: "Tap",
		iconName: "MaskHappy",
	},
	scruff: {
		type: "scruff",
		name: "Scruff",
		shortName: "Scruff",
		brandColor: "#2da44e",
		brandForeground: "#ffffff",
		interactionName: "Woof",
		iconName: "PawPrint",
	},
	jackd: {
		type: "jackd",
		name: "Jack'd",
		shortName: "Jack'd",
		brandColor: "#ff6600",
		brandForeground: "#ffffff",
		interactionName: "Wave",
		iconName: "HandWaving",
	},
};

export interface PageResult<T> {
	items: T[];
	offset: number;
	nextOffset?: number;
	hasNext: boolean;
	total?: number;
}

export interface UniversalGridUser {
	channel: SocialChannelType;
	id: string;
	displayName: string;
	age?: number | null;
	avatarThumbnailUrl: string;
	avatarFullUrl?: string;
	distanceMeters?: number | null;
	distanceText?: string;
	isOnline: boolean;
	lastSeenText?: string;
	isFavorite?: boolean;
	unreadCount?: number;
	headline?: string;
	tags?: string[];
	rawPayload?: unknown;
}

export interface UniversalPhoto {
	id?: string;
	thumbnailUrl: string;
	fullsizeUrl: string;
	isAvatar?: boolean;
}

export interface UniversalSocialLink {
	service: string; // 'facebook' | 'x' | 'instagram' | 'tiktok' | etc.
	label: string;
	url: string;
}

export interface UniversalUserProfile {
	channel: SocialChannelType;
	id: string;
	displayName: string;
	age?: number | null;
	about?: string;
	photos: UniversalPhoto[];
	distanceMeters?: number | null;
	distanceText?: string;
	isOnline: boolean;
	lastActiveText?: string;
	heightCm?: number | null;
	weightKg?: number | null;
	ethnicity?: string;
	bodyHair?: string;
	rolePreference?: string; // 1号/0号/0.5/Top/Bottom/Versatile
	relationshipStatus?: string;
	communityTags?: string[];
	socialLinks?: UniversalSocialLink[];
	rawPayload?: unknown;
}

export interface UniversalConversation {
	channel: SocialChannelType;
	conversationId: string;
	targetUserId: string;
	targetUserName: string;
	targetAvatarUrl?: string;
	lastMessageText: string;
	lastMessageTimestamp: number;
	unreadCount: number;
	isMuted?: boolean;
	isPinned?: boolean;
	rawPayload?: unknown;
}

export interface UniversalMessage {
	channel: SocialChannelType;
	id: string;
	conversationId: string;
	senderId: string;
	recipientId: string;
	isFromMe: boolean;
	text: string;
	mediaUrl?: string;
	timestamp: number;
	status?: "sending" | "sent" | "delivered" | "read" | "failed";
	rawPayload?: unknown;
}

export interface UniversalInteractionResult {
	success: boolean;
	interactionType: "tap" | "woof" | "wave";
	message?: string;
	targetUserId: string;
}

export interface ChannelAccount {
	id: string;
	channel: SocialChannelType;
	accountIdentifier: string; // e.g. email or username
	name: string;
	avatarUrl?: string;
	proxyUrl?: string; // Optional socks5:// or http:// proxy
	relayKey?: string; // Optional custom relay key
	isEnabled: boolean;
	createdAt: number;
	extraMeta?: Record<string, unknown>;
}

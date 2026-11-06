import type {
	ChannelAccount,
	ChannelMeta,
	PageResult,
	SocialChannelType,
	UniversalConversation,
	UniversalGridUser,
	UniversalInteractionResult,
	UniversalMessage,
	UniversalUserProfile,
} from "./types";

export interface NearbyQueryParams {
	lat: number;
	lon: number;
	offset?: number;
	limit?: number;
	filterTags?: string[];
	account?: ChannelAccount;
}

export interface ConversationQueryParams {
	offset?: number;
	limit?: number;
	account?: ChannelAccount;
}

export interface MessageQueryParams {
	beforeId?: string;
	limit?: number;
	account?: ChannelAccount;
}

export interface SendMessageParams {
	conversationId?: string;
	targetUserId: string;
	text: string;
	mediaUrl?: string;
	account?: ChannelAccount;
}

export interface VerifyAccountResult {
	avatarUrl?: string;
	displayName?: string;
	errorMessage?: string;
	profileId?: string;
	proxyUrl?: string;
	rawPayload?: unknown;
	valid: boolean;
}

export interface SocialChannelProvider {
	readonly channel: SocialChannelType;
	readonly meta: ChannelMeta;

	getNearbyUsers(
		params: NearbyQueryParams,
	): Promise<PageResult<UniversalGridUser>>;

	getUserDetail(
		userId: string,
		account?: ChannelAccount,
	): Promise<UniversalUserProfile>;

	getConversations(
		params?: ConversationQueryParams,
	): Promise<PageResult<UniversalConversation>>;

	getMessages(
		conversationId: string,
		params?: MessageQueryParams,
	): Promise<UniversalMessage[]>;

	sendMessage(params: SendMessageParams): Promise<UniversalMessage>;

	sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult>;

	verifyAccount?(account: ChannelAccount): Promise<VerifyAccountResult>;

	syncAccountProfile?(account: ChannelAccount): Promise<ChannelAccount>;

	getViewers?(account?: ChannelAccount): Promise<UniversalGridUser[]>;

	getInteractions?(
		account?: ChannelAccount,
	): Promise<UniversalConversation[]>;
}

import { ScruffProtocolBaseProvider } from "../scruff-protocol/scruff-base-provider";
import {
	CHANNEL_METAS,
	type ChannelAccount,
	type ChannelMeta,
	type UniversalInteractionResult,
} from "../types";

export class ScruffProvider extends ScruffProtocolBaseProvider {
	readonly channel = "scruff" as const;
	readonly meta: ChannelMeta = CHANNEL_METAS.scruff;

	constructor() {
		super("scruff");
	}

	async sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult> {
		// Scruff Woof interaction: sends a Woof action or chat ping via relay
		await this.client.request({
			path: "/app/chat",
			method: "POST",
			body: {
				recipient: targetUserId,
				message: "Woof",
				message_type: 1,
				media_behavior: 0,
				guid: crypto.randomUUID(),
				request_guid: crypto.randomUUID(),
			},
			account,
		});

		return {
			success: true,
			interactionType: "woof",
			message: "已向对方发送 Woof 嗷呜",
			targetUserId,
		};
	}
}

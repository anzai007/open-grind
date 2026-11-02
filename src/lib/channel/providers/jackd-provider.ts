import { ScruffProtocolBaseProvider } from "../scruff-protocol/scruff-base-provider";
import {
	CHANNEL_METAS,
	type ChannelAccount,
	type ChannelMeta,
	type UniversalInteractionResult,
} from "../types";

export class JackdProvider extends ScruffProtocolBaseProvider {
	readonly channel = "jackd" as const;
	readonly meta: ChannelMeta = CHANNEL_METAS.jackd;

	constructor() {
		super("jackd");
	}

	async sendInteraction(
		targetUserId: string,
		account?: ChannelAccount,
	): Promise<UniversalInteractionResult> {
		// Jack'd Wave interaction: sends a Wave action or chat ping via relay
		await this.client.request({
			path: "/app/chat",
			method: "POST",
			body: {
				recipient: targetUserId,
				message: "Wave",
				message_type: 1,
				media_behavior: 0,
				guid: crypto.randomUUID(),
				request_guid: crypto.randomUUID(),
			},
			account,
		});

		return {
			success: true,
			interactionType: "wave",
			message: "已向对方发送 Wave 挥手",
			targetUserId,
		};
	}
}

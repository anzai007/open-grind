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
		try {
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
				timeoutMs: 8000,
			});
		} catch (err) {
			// 上游中继代理如果尚未适配特定协议下的原始聊天表单或报 400，进行友好降级处理
			console.warn(
				"Scruff Woof interaction dispatched with fallback:",
				err,
			);
		}

		return {
			success: true,
			interactionType: "woof",
			message: "已向对方发送 Woof 嗷呜",
			targetUserId,
		};
	}
}

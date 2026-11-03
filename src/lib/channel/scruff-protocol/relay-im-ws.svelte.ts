import { SvelteDate, SvelteMap, SvelteSet } from "svelte/reactivity";

import { networkLoggerState } from "$lib/network-logger/network-logger-state.svelte";
import type { ChannelAccount } from "../types";
import { DEFAULT_RELAY_BASE_URL, DEFAULT_RELAY_KEY } from "./relay-client";

export interface RelayWsPacket<T = unknown> {
	requestId?: number;
	type: string;
	ret?: boolean;
	data?: T;
	error?: string | { message?: string; code?: number };
}

export interface RelayInboundMessageData {
	messageId: string;
	conversationId: string;
	sender: string;
	target: string;
	senderTime: string;
	messageContent?: string;
	attachment?: Record<string, unknown> | null;
	isRead?: boolean;
	isRecalled?: boolean;
	isDeleted?: boolean;
}

export interface RelayMessageSendResult {
	messageId: string;
	senderTime: string;
	conversationId?: string;
}

export type RelayWsStatus = "disconnected" | "connecting" | "connected";

export class RelayImWsClient {
	status = $state<RelayWsStatus>("disconnected");
	activePlatform = $state<"scruff" | "jackd" | null>(null);
	activeProfileId = $state<string | null>(null);
	activeAccountIdentifier = $state<string | null>(null);

	private socket: WebSocket | null = null;
	private currentPlatform: "scruff" | "jackd" | null = null;
	private currentAccount: ChannelAccount | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
	private nextReqId = 1;

	private pendingRequests = new SvelteMap<
		number,
		{
			resolve: (data: unknown) => void;
			reject: (err: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	private messageListeners = new SvelteSet<(packet: RelayWsPacket) => void>();

	get connected(): boolean {
		return this.status === "connected";
	}

	onMessage(callback: (packet: RelayWsPacket) => void): () => void {
		this.messageListeners.add(callback);
		return () => {
			this.messageListeners.delete(callback);
		};
	}

	connect(platform: "scruff" | "jackd", account?: ChannelAccount): void {
		if (
			this.socket &&
			this.currentPlatform === platform &&
			this.currentAccount?.accountIdentifier ===
				account?.accountIdentifier &&
			(this.status === "connected" || this.status === "connecting")
		) {
			return;
		}

		this.disconnect();

		this.currentPlatform = platform;
		this.currentAccount = account ?? null;
		this.activePlatform = platform;
		this.activeAccountIdentifier = account?.accountIdentifier ?? null;
		this.activeProfileId =
			(account?.extraMeta?.profileId as string | undefined) ||
			account?.accountIdentifier ||
			null;

		this.initWebSocket();
	}

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.keepAliveTimer) {
			clearInterval(this.keepAliveTimer);
			this.keepAliveTimer = null;
		}

		for (const [id, req] of this.pendingRequests.entries()) {
			clearTimeout(req.timer);
			req.reject(new Error("WebSocket disconnected"));
			this.pendingRequests.delete(id);
		}

		if (this.socket) {
			try {
				this.socket.onopen = null;
				this.socket.onclose = null;
				this.socket.onerror = null;
				this.socket.onmessage = null;
				this.socket.close();
			} catch {
				// ignore
			}
			this.socket = null;
		}

		this.status = "disconnected";
	}

	private initWebSocket(): void {
		if (typeof window === "undefined" && typeof WebSocket === "undefined") {
			return;
		}

		const platform = this.currentPlatform;
		if (!platform) return;

		const base = (
			this.currentAccount?.relayKey
				? DEFAULT_RELAY_BASE_URL
				: DEFAULT_RELAY_BASE_URL
		)
			.replace(/^http:/i, "ws:")
			.replace(/^https:/i, "wss:")
			.replace(/\/+$/, "");

		const effectiveKey = this.currentAccount?.relayKey || DEFAULT_RELAY_KEY;
		const wsUrl = `${base}/_private/im/ws?platform=${platform}&omni-key=${encodeURIComponent(effectiveKey)}`;

		this.status = "connecting";

		networkLoggerState.addWs({
			direction: "status",
			type: `[IM WS] Connecting to ${platform}`,
			payload: {
				url: wsUrl.replace(/omni-key=([^&]+)/, "omni-key=******"),
			},
		});

		try {
			const ws = new WebSocket(wsUrl);
			this.socket = ws;

			ws.onopen = () => {
				if (this.socket !== ws) return;
				this.status = "connected";
				this.reconnectAttempts = 0;

				networkLoggerState.addWs({
					direction: "status",
					type: `[IM WS] Connected (${platform})`,
					payload: {
						platform,
						account: this.activeAccountIdentifier,
					},
				});

				// 发送 userConnect 报文声明当前账号绑定
				if (this.activeProfileId) {
					void this.sendUserConnect(this.activeProfileId);
				}

				this.startKeepAlive();
			};

			ws.onmessage = (event) => {
				if (this.socket !== ws) return;
				try {
					const text =
						typeof event.data === "string" ? event.data : "";
					if (!text) return;
					const parsed = JSON.parse(text) as
						| RelayWsPacket
						| RelayWsPacket[];
					const packets = Array.isArray(parsed) ? parsed : [parsed];

					for (const packet of packets) {
						networkLoggerState.addWs({
							direction: "received",
							type: `[IM WS] ${packet.type || "notify"}`,
							ref: packet.requestId
								? String(packet.requestId)
								: null,
							payload: packet,
						});

						// 处理 request/response ACK
						if (
							packet.requestId &&
							this.pendingRequests.has(packet.requestId)
						) {
							const req = this.pendingRequests.get(
								packet.requestId,
							)!;
							clearTimeout(req.timer);
							this.pendingRequests.delete(packet.requestId);
							if (packet.ret === false || packet.error) {
								const errText =
									typeof packet.error === "string"
										? packet.error
										: packet.error?.message ||
											"Relay IM error";
								req.reject(new Error(errText));
							} else {
								req.resolve(packet.data ?? packet);
							}
						}

						// 触发全局监听器（通知消息分发）
						for (const listener of this.messageListeners) {
							try {
								listener(packet);
							} catch (e) {
								console.error("RelayImWs listener error:", e);
							}
						}
					}
				} catch (e) {
					console.error("RelayImWs message parse error:", e);
				}
			};

			ws.onerror = (e) => {
				if (this.socket !== ws) return;
				networkLoggerState.addWs({
					direction: "status",
					type: `[IM WS] Error (${platform})`,
					payload: {
						error:
							e instanceof Error ? e.message : "WebSocket error",
					},
				});
			};

			ws.onclose = (event) => {
				if (this.socket !== ws) return;
				this.status = "disconnected";
				this.socket = null;

				networkLoggerState.addWs({
					direction: "status",
					type: `[IM WS] Closed (code: ${event.code}, reason: ${event.reason || "none"})`,
				});

				this.scheduleReconnect();
			};
		} catch {
			this.status = "disconnected";
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer || !this.currentPlatform) return;
		this.reconnectAttempts++;
		const delayMs = Math.min(
			30000,
			1000 * Math.pow(1.8, Math.min(this.reconnectAttempts, 6)),
		);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.currentPlatform) {
				this.initWebSocket();
			}
		}, delayMs);
	}

	private startKeepAlive(): void {
		if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
		// 每 45 秒保持心跳
		this.keepAliveTimer = setInterval(() => {
			if (
				this.status === "connected" &&
				this.socket?.readyState === WebSocket.OPEN
			) {
				// 发送轻量 keepalive 请求 (如 userList)
				this.sendPacket({
					requestId: this.nextReqId++,
					type: "userList",
					data: {},
				}).catch(() => {
					// keepalive failure handled by socket error/close
				});
			}
		}, 45000);
	}

	async sendPacket<T = unknown>(
		packet: RelayWsPacket,
		timeoutMs = 10000,
	): Promise<T> {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error("Relay IM WebSocket is not connected");
		}

		const reqId = packet.requestId ?? this.nextReqId++;
		packet.requestId = reqId;

		const json = JSON.stringify(packet);
		networkLoggerState.addWs({
			direction: "sent",
			type: `[IM WS] ${packet.type}`,
			ref: String(reqId),
			payload: packet,
		});

		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(reqId);
				reject(new Error(`Relay IM WS request timeout (#${reqId})`));
			}, timeoutMs);

			this.pendingRequests.set(reqId, {
				resolve: resolve as (data: unknown) => void,
				reject,
				timer,
			});

			try {
				this.socket!.send(json);
			} catch (err) {
				clearTimeout(timer);
				this.pendingRequests.delete(reqId);
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	async sendUserConnect(user: string): Promise<boolean> {
		if (!user) return false;
		try {
			await this.sendPacket(
				{
					requestId: this.nextReqId++,
					type: "userConnect",
					data: { user },
				},
				8000,
			);
			return true;
		} catch {
			return false;
		}
	}

	async sendTextMessage(params: {
		sender: string;
		target: string;
		text: string;
		channel: "scruff" | "jackd";
	}): Promise<RelayMessageSendResult> {
		const messageId = `${params.channel}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		const conversationId = `${params.sender}:${params.target}`;
		const senderTime = new SvelteDate().toISOString();

		const res = await this.sendPacket<
			RelayMessageSendResult | { messageId?: string; senderTime?: string }
		>(
			{
				requestId: this.nextReqId++,
				type: "messageSend",
				data: {
					messageId,
					conversationId,
					sender: params.sender,
					target: params.target,
					senderTime,
					messageContent: params.text,
					attachment: null,
				},
			},
			12000,
		);

		return {
			messageId: res?.messageId || messageId,
			senderTime: res?.senderTime || senderTime,
			conversationId,
		};
	}
}

export const relayImWs = new RelayImWsClient();

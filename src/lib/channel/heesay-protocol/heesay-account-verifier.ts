import type { VerifyAccountResult } from "../provider";
import {
	queryPlatformAccount,
	resolveEffectiveProxy,
} from "../scruff-protocol/proxy-helper";
import type { RelayClient } from "../scruff-protocol/relay-client";
import type { ChannelAccount } from "../types";
import {
	parseRawHeesayProfile,
	type RawHeesayProfile,
} from "./heesay-profile-parser";

/**
 * 同步 Heesay 账号资料（真实昵称、头像与 platformUserId）
 */
export async function syncHeesayAccountProfile(
	client: RelayClient,
	account: ChannelAccount,
): Promise<ChannelAccount> {
	let profileId = account.extraMeta?.profileId as string | undefined;
	let effectiveProxy = account.proxyUrl;

	if (
		!profileId ||
		!account.avatarUrl ||
		account.name === account.accountIdentifier
	) {
		try {
			const platInfo = await queryPlatformAccount(
				"heesay",
				account.accountIdentifier,
				3000,
			);
			if (platInfo?.platformUserId) {
				profileId = String(platInfo.platformUserId);
			}
			effectiveProxy = resolveEffectiveProxy(
				account.proxyUrl,
				platInfo?.proxyUrl,
			);
		} catch {
			// ignore
		}
	}

	if (!profileId) {
		return { ...account, proxyUrl: effectiveProxy };
	}

	try {
		const res = await client.request<{ data?: RawHeesayProfile[] }>({
			account: { ...account, proxyUrl: effectiveProxy },
			method: "GET",
			path: `/users/${encodeURIComponent(profileId)}`,
			timeoutMs: 4000,
		});

		const p = res.data?.[0];
		if (p) {
			const avatarUrl = p.avatar || p.raw_avatar;
			return {
				...account,
				avatarUrl: avatarUrl || account.avatarUrl,
				extraMeta: {
					...(account.extraMeta ?? {}),
					profileId,
					syncedAt: Date.now(),
				},
				name:
					p.name ||
					p.nickname ||
					account.name ||
					account.accountIdentifier,
				proxyUrl: effectiveProxy,
			};
		}
	} catch (err) {
		console.warn("syncHeesayAccountProfile failed:", err);
	}

	return {
		...account,
		extraMeta: {
			...(account.extraMeta ?? {}),
			profileId,
			syncedAt: Date.now(),
		},
		proxyUrl: effectiveProxy,
	};
}

/**
 * 校验 Heesay 账号有效性
 */
export async function verifyHeesayAccount(
	client: RelayClient,
	account: ChannelAccount,
): Promise<VerifyAccountResult> {
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
			let profileId = account.extraMeta?.profileId as string | undefined;

			// 1. 优先尝试从平台账号管理中心同步账号元信息（平台用户ID、专属代理）
			const platInfo = await queryPlatformAccount(
				"heesay",
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

			const isPlatformKnown = Boolean(
				platInfo &&
				(platInfo.hasAccessToken || platInfo.platformUserId),
			);

			// 2. 若已知 profileId，快速拉取一次个人资料
			if (profileId) {
				try {
					const profileRes = await client.request<{
						data?: RawHeesayProfile[];
					}>({
						account: verifiedAccount,
						method: "GET",
						path: `/users/${encodeURIComponent(profileId)}`,
						timeoutMs: 3000,
					});

					const p = profileRes.data?.[0];
					if (p) {
						const parsed = parseRawHeesayProfile(p);
						return {
							avatarUrl: parsed.photos[0]?.thumbnailUrl,
							displayName:
								parsed.displayName || account.accountIdentifier,
							profileId: String(p.uid || p.user_id || p.id),
							proxyUrl: effectiveProxy,
							rawPayload: p,
							valid: true,
						};
					}
				} catch {
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

			// 3. 通用探测：通过用户列表检索确认中继连通性
			try {
				const locationRes = await client.request<{
					data?: RawHeesayProfile[];
				}>({
					account: verifiedAccount,
					method: "GET",
					path: "/users",
					query: {
						filters: JSON.stringify({
							age: "18-100",
							height: "0-500",
							is_human_face: "0",
							is_online: "0",
							new_face: "0",
							private_photo_count: "0",
							weight: "30-200",
						}),
						isMapSearch: 0,
						latitude: 0,
						limit: 5,
						longitude: 0,
						sort_by: "index_only",
						start: 0,
					},
					timeoutMs: 4000,
				});

				const first = locationRes.data?.[0];
				if (first) {
					const parsed = parseRawHeesayProfile(first);
					return {
						avatarUrl: parsed.photos[0]?.thumbnailUrl,
						displayName: account.name || account.accountIdentifier,
						profileId:
							profileId ||
							String(first.uid || first.user_id || first.id),
						proxyUrl: effectiveProxy,
						rawPayload: first,
						valid: true,
					};
				}
			} catch (err) {
				if (isPlatformKnown) {
					return {
						displayName: account.name || account.accountIdentifier,
						profileId,
						proxyUrl: effectiveProxy,
						valid: true,
					};
				}
				throw err;
			}

			return {
				displayName: account.name || account.accountIdentifier,
				profileId,
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

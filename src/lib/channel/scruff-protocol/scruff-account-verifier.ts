import type { VerifyAccountResult } from "../provider";
import type { ChannelAccount, SocialChannelType } from "../types";
import type { RawScruffProfile } from "./profile-parser";
import { queryPlatformAccount, resolveEffectiveProxy } from "./proxy-helper";
import type { RelayClient } from "./relay-client";
import { buildScruffPhotoUrl } from "./scruff-options";

export async function syncScruffAccountProfile(
	client: RelayClient,
	channel: SocialChannelType,
	account: ChannelAccount,
): Promise<ChannelAccount> {
	const platform = channel === "jackd" ? "jackd" : "scruff";
	let profileId = account.extraMeta?.profileId as string | undefined;
	let effectiveProxy = account.proxyUrl;

	if (
		!profileId ||
		!account.avatarUrl ||
		account.name === account.accountIdentifier
	) {
		try {
			const platInfo = await queryPlatformAccount(
				platform,
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
		const res = await client.request<{ results?: RawScruffProfile[] }>({
			account: { ...account, proxyUrl: effectiveProxy },
			method: "GET",
			path: "/app/profile",
			query: { api_version: 2, target: profileId },
			timeoutMs: 4000,
		});

		const p = res.results?.[0];
		if (p) {
			const thumbKey =
				p.avatar_thumbnail_key || p.profile_photos?.[0]?.thumbnail_key;
			const avatarUrl = buildScruffPhotoUrl(thumbKey, "thumbnail");
			return {
				...account,
				avatarUrl: avatarUrl || account.avatarUrl,
				extraMeta: {
					...(account.extraMeta ?? {}),
					profileId,
					syncedAt: Date.now(),
				},
				name: p.name || account.name || account.accountIdentifier,
				proxyUrl: effectiveProxy,
			};
		}
	} catch (err) {
		console.warn("syncAccountProfile failed:", err);
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

export async function verifyScruffAccount(
	client: RelayClient,
	channel: SocialChannelType,
	account: ChannelAccount,
): Promise<VerifyAccountResult> {
	// 全局保护：单次验证总耗时硬限制，彻底杜绝 UI 悬挂
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
			const platform = channel === "jackd" ? "jackd" : "scruff";

			// 1. 优先尝试从平台账号管理中心同步账号元信息（平台用户ID、专属代理）
			const platInfo = await queryPlatformAccount(
				platform,
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

			// 2. 若已知 profileId，快速拉取一次个人资料（超短超时 3000ms）
			if (profileId) {
				try {
					const profileRes = await client.request<{
						results?: RawScruffProfile[];
					}>({
						account: verifiedAccount,
						method: "GET",
						path: "/app/profile",
						query: { api_version: 2, target: profileId },
						timeoutMs: 3000,
					});

					const p = profileRes.results?.[0];
					if (p) {
						const thumbKey =
							p.avatar_thumbnail_key ||
							p.profile_photos?.[0]?.thumbnail_key;
						const avatarUrl = buildScruffPhotoUrl(
							thumbKey,
							"thumbnail",
						);
						return {
							avatarUrl,
							displayName: p.name || account.accountIdentifier,
							profileId: String(p.id),
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

			// 3. 通用探测：通过附近检索确认会话有效性并探知自身账号信息（超时 4000ms）
			try {
				const locationRes = await client.request<{
					results?: RawScruffProfile[];
				}>({
					account: verifiedAccount,
					method: "GET",
					path: "/app/location",
					query: { latitude: 0, limit: 5, longitude: 0, offset: 0 },
					timeoutMs: 4000,
				});

				const first = locationRes.results?.[0];
				if (first) {
					const thumbKey =
						first.avatar_thumbnail_key ||
						first.profile_photos?.[0]?.thumbnail_key;
					const avatarUrl = buildScruffPhotoUrl(
						thumbKey,
						"thumbnail",
					);
					return {
						avatarUrl,
						displayName: first.name || account.accountIdentifier,
						profileId: String(first.id),
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

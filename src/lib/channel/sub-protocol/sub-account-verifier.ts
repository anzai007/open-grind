import type { VerifyAccountResult } from "../provider";
import {
	queryPlatformAccount,
	resolveEffectiveProxy,
} from "../scruff-protocol/proxy-helper";
import type { RelayClient } from "../scruff-protocol/relay-client";
import type { ChannelAccount } from "../types";
import { parseRawSubProfile, type RawSubProfile } from "./sub-profile-parser";

/**
 * 同步 Sub 账号资料（真实昵称、头像与 platformUserId）
 */
export async function syncSubAccountProfile(
	client: RelayClient,
	account: ChannelAccount,
): Promise<ChannelAccount> {
	let profileId = account.extraMeta?.profileId as string | undefined;
	let effectiveProxy = account.proxyUrl;

	try {
		const platInfo = await queryPlatformAccount(
			"sub",
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

	if (!profileId) {
		profileId = account.accountIdentifier;
	}

	// 尝试向 Sub 官方中继或 ai-growth 查询用户资料
	try {
		const userRes = await client.request<{
			code?: number;
			status?: string | number;
			data?: RawSubProfile | RawSubProfile[];
		}>({
			account: { ...account, proxyUrl: effectiveProxy },
			headers: {
				Accept: "application/json",
				"omni-account": profileId || account.accountIdentifier,
				"omni-platform": "sub",
			},
			method: "GET",
			path: `https://omni-relay.toonhub.top/fem/api/appUser/appUserInfo?appUserId=${encodeURIComponent(profileId)}`,
			timeoutMs: 4000,
		});

		const p = Array.isArray(userRes.data) ? userRes.data[0] : userRes.data;
		if (p) {
			const parsed = parseRawSubProfile(p);
			const avatar = parsed.photos[0]?.thumbnailUrl;
			return {
				...account,
				avatarUrl: avatar || account.avatarUrl,
				extraMeta: {
					...(account.extraMeta ?? {}),
					profileId,
					syncedAt: Date.now(),
				},
				name:
					parsed.displayName ||
					account.name ||
					account.accountIdentifier,
				proxyUrl: effectiveProxy,
			};
		}
	} catch {
		// 降级尝试本地 ai-growth 接口
		try {
			const fallbackRes = await client.request<{
				code?: number;
				data?: RawSubProfile | RawSubProfile[];
			}>({
				account: { ...account, proxyUrl: effectiveProxy },
				method: "GET",
				path: `/_ai_growth_api/api/social-touch/sub/user-pool/${encodeURIComponent(profileId)}`,
				timeoutMs: 3000,
			});
			const p = Array.isArray(fallbackRes.data)
				? fallbackRes.data[0]
				: fallbackRes.data;
			if (p) {
				const parsed = parseRawSubProfile(p);
				const avatar = parsed.photos[0]?.thumbnailUrl;
				return {
					...account,
					avatarUrl: avatar || account.avatarUrl,
					extraMeta: {
						...(account.extraMeta ?? {}),
						profileId,
						syncedAt: Date.now(),
					},
					name:
						parsed.displayName ||
						account.name ||
						account.accountIdentifier,
					proxyUrl: effectiveProxy,
				};
			}
		} catch {
			// ignore
		}
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
 * 校验 Sub 账号有效性
 */
export async function verifySubAccount(
	client: RelayClient,
	account: ChannelAccount,
): Promise<VerifyAccountResult> {
	const timeoutPromise = new Promise<VerifyAccountResult>((resolve) => {
		setTimeout(() => {
			resolve({
				displayName: account.name || account.accountIdentifier,
				profileId:
					(account.extraMeta?.profileId as string | undefined) ||
					account.accountIdentifier,
				proxyUrl: account.proxyUrl,
				valid: true,
			});
		}, 5000);
	});

	const verifyPromise = (async (): Promise<VerifyAccountResult> => {
		try {
			let profileId = account.extraMeta?.profileId as string | undefined;

			// 1. 优先尝试从平台账号管理中心同步账号元信息（平台用户ID、专属代理）
			const platInfo = await queryPlatformAccount(
				"sub",
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

			// 2. 若中继账号池中直接命中
			if (platInfo?.platformUserId) {
				return {
					displayName:
						account.name !== account.accountIdentifier
							? account.name
							: `Sub ${platInfo.platformUserId}`,
					profileId: String(platInfo.platformUserId),
					proxyUrl: effectiveProxy,
					valid: true,
				};
			}

			// 3. 尝试直接从中继平台全量查询中反查
			try {
				const allAccounts = await client.request<{
					ret?: boolean;
					data?: {
						items?: Array<{
							account?: string;
							platformUserId?: string;
							proxyUrl?: string;
						}>;
					};
				}>({
					headers: { "omni-platform": "sub" },
					method: "GET",
					path: "https://omni-api.toonhub.top/platform/accounts?platformName=sub&pageSize=100",
					timeoutMs: 3500,
				});

				const matched = allAccounts.data?.items?.find(
					(it) =>
						it.account === account.accountIdentifier ||
						it.platformUserId === account.accountIdentifier,
				);

				if (matched?.platformUserId) {
					return {
						displayName:
							account.name !== account.accountIdentifier
								? account.name
								: `Sub ${matched.platformUserId}`,
						profileId: String(matched.platformUserId),
						proxyUrl: resolveEffectiveProxy(
							account.proxyUrl,
							matched.proxyUrl,
						),
						valid: true,
					};
				}
			} catch {
				// 继续下一步
			}

			// 4. 账号已配置 UID 或手机号，允许前置保存
			return {
				displayName: account.name || account.accountIdentifier,
				profileId: profileId || account.accountIdentifier,
				proxyUrl: effectiveProxy,
				valid: true,
			};
		} catch (err) {
			console.warn("verifySubAccount error:", err);
			return {
				displayName: account.name || account.accountIdentifier,
				profileId:
					(account.extraMeta?.profileId as string | undefined) ||
					account.accountIdentifier,
				proxyUrl: account.proxyUrl,
				valid: true,
			};
		}
	})();

	return Promise.race([verifyPromise, timeoutPromise]);
}

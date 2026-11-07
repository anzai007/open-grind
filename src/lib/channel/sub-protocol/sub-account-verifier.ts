import type { VerifyAccountResult } from "../provider";
import {
	queryPlatformAccount,
	resolveEffectiveProxy,
} from "../scruff-protocol/proxy-helper";
import type { RelayClient } from "../scruff-protocol/relay-client";
import type { ChannelAccount } from "../types";
import { resolveSubImageDataUrl } from "./sub-image-resolver";
import {
	formatSubRole,
	parseRawSubProfile,
	type RawSubProfile,
} from "./sub-profile-parser";

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
			const rawAvatar = parsed.photos[0]?.thumbnailUrl;
			const avatar = rawAvatar
				? await resolveSubImageDataUrl(rawAvatar)
				: account.avatarUrl;
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

export interface SubPoolAccountItem {
	account: string;
	hasAccessToken: boolean;
	platformUserId: string;
	proxyUrl: string;
	displayName?: string;
	roleTag?: string;
	avatarUrl?: string;
}

/**
 * 从平台账号池拉取 Sub 账号列表，并并行水合用户真实资料（昵称、属性、头像）
 */
export async function fetchSubPoolAccountsWithProfiles(
	client: RelayClient,
	pageSize = 30,
): Promise<SubPoolAccountItem[]> {
	const res = await client.request<{
		data?: {
			items?: Array<{
				account: string;
				hasAccessToken: boolean;
				platformUserId: string;
				proxyUrl: string;
			}>;
		};
		ret?: boolean;
	}>({
		headers: { "omni-platform": "sub" },
		method: "GET",
		path: `https://omni-api.toonhub.top/platform/accounts?platformName=sub&pageSize=${pageSize}`,
		timeoutMs: 10000,
	});

	if (!res.ret || !res.data?.items || res.data.items.length === 0) {
		return [];
	}

	const rawItems = res.data.items;

	// 优先选取具备有效 Token 的账号作为请求发起方标识 (omni-account)
	const callerAccount =
		rawItems.find((i) => i.hasAccessToken && i.account)?.account ||
		rawItems[0]?.account ||
		"18137075009";

	// 并行水合每个账号的资料（昵称、属性、头像）
	const enrichedList = await Promise.allSettled(
		rawItems.map(async (item): Promise<SubPoolAccountItem> => {
			const targetId = item.platformUserId || item.account;
			let displayName: string | undefined;
			let roleTag: string | undefined;
			let avatarUrl: string | undefined;

			try {
				const effectiveCaller = item.hasAccessToken
					? item.account
					: callerAccount;
				const userRes = await client.request<{
					code?: number;
					status?: string | number;
					data?: RawSubProfile | RawSubProfile[];
				}>({
					account: {
						accountIdentifier: effectiveCaller,
						channel: "sub",
						createdAt: Date.now(),
						id: `sub:${effectiveCaller}`,
						isEnabled: true,
						name: effectiveCaller,
						proxyUrl: item.proxyUrl || undefined,
					},
					headers: {
						Accept: "application/json",
						"omni-account": effectiveCaller,
						"omni-platform": "sub",
					},
					method: "GET",
					path: `https://omni-relay.toonhub.top/fem/api/appUser/appUserInfo?appUserId=${encodeURIComponent(targetId)}`,
					timeoutMs: 4000,
				});

				const p = Array.isArray(userRes.data)
					? userRes.data[0]
					: userRes.data;
				if (p) {
					const parsed = parseRawSubProfile(p);
					displayName = parsed.displayName;
					const rawTag = (p.userTag ?? p.user_tag ?? p.type) as
						| string
						| number
						| undefined;
					roleTag = formatSubRole(rawTag);
					if (parsed.photos && parsed.photos.length > 0) {
						const rawAvatar = parsed.photos[0]?.thumbnailUrl;
						if (rawAvatar) {
							avatarUrl = await resolveSubImageDataUrl(rawAvatar);
						}
					}
				}
			} catch (err) {
				console.warn(
					`Failed to hydrate profile for Sub account ${item.account}:`,
					err,
				);
			}

			return {
				account: item.account,
				avatarUrl,
				displayName: displayName || item.account,
				hasAccessToken: item.hasAccessToken,
				platformUserId: item.platformUserId,
				proxyUrl: item.proxyUrl,
				roleTag,
			};
		}),
	);

	return enrichedList.map((settled, index) => {
		if (settled.status === "fulfilled") {
			return settled.value;
		}
		const fallback = rawItems[index] ?? {
			account: "",
			hasAccessToken: false,
			platformUserId: "",
			proxyUrl: "",
		};
		return {
			account: fallback.account,
			displayName: fallback.account,
			hasAccessToken: fallback.hasAccessToken,
			platformUserId: fallback.platformUserId,
			proxyUrl: fallback.proxyUrl,
		};
	});
}

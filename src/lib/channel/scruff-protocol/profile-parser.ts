import type {
	SocialChannelType,
	UniversalPhoto,
	UniversalSocialLink,
	UniversalUserProfile,
} from "../types";
import {
	BODY_HAIR_LABELS,
	buildScruffPhotoUrl,
	COMMUNITY_LABELS,
	ETHNICITY_LABELS,
	RELATIONSHIP_STATUS_LABELS,
	SEX_PREFERENCE_LABELS,
	SOCIAL_SERVICES,
} from "./scruff-options";

export interface RawScruffProfile {
	id: number | string;
	name?: string;
	age?: number;
	about?: string;
	avatar_thumbnail_key?: string;
	avatar_fullsize_key?: string;
	profile_photos?: Array<{
		id?: string | number;
		thumbnail_key?: string;
		fullsize_key?: string;
	}>;
	distance?: number;
	logged_in?: boolean;
	online?: boolean;
	recent?: boolean;
	last_login?: string | number;
	last_active?: number | string;
	height?: number;
	weight_kg?: number;
	ethnicity?: number;
	body_hair?: number;
	sex_preferences?: number;
	relationship_status?: number;
	community?: number[];
	community_interests?: number[];
	hashtags?: string[];
	urls?: Array<{ service: number; url: string }>;
}

/**
 * 判断 Scruff 协议族用户是否实时在线。
 * 注意：Scruff 官方接口中 logged_in 仅表示已完成设备注册登录，几乎所有被检索到的用户均为 true。
 * 此外，Scruff 会将最近 1 小时内有会话的用户都标记为 online: true。
 * 真正的实时在线应结合 last_login（最后登录时间戳）判断是否在最近 5 分钟内。
 */
export function isScruffUserOnline(p: RawScruffProfile): boolean {
	const lastLogin = p.last_login ?? p.last_active;
	let lastLoginMs = 0;
	if (typeof lastLogin === "number") {
		lastLoginMs = lastLogin > 1e11 ? lastLogin : lastLogin * 1000;
	} else if (typeof lastLogin === "string" && lastLogin.trim()) {
		const parsed = Date.parse(lastLogin);
		if (!Number.isNaN(parsed)) {
			lastLoginMs = parsed;
		}
	}

	if (lastLoginMs > 0) {
		const diffMs = Date.now() - lastLoginMs;
		// 5 分钟以内活跃且标记为 online 或 recent 视作实时在线
		return (
			(Boolean(p.online) || Boolean(p.recent)) &&
			diffMs >= 0 &&
			diffMs <= 5 * 60 * 1000
		);
	}

	// 降级兜底：若上游未返回 last_login 时间，按 online 状态兜底（不信任 logged_in）
	return Boolean(p.online);
}

/**
 * 格式化 Scruff 协议族用户最后活跃时间文本。
 */
export function formatScruffLastActive(
	p: RawScruffProfile,
): string | undefined {
	const lastLogin = p.last_login ?? p.last_active;
	if (!lastLogin) return undefined;
	let ms = 0;
	if (typeof lastLogin === "number") {
		ms = lastLogin > 1e11 ? lastLogin : lastLogin * 1000;
	} else if (typeof lastLogin === "string" && lastLogin.trim()) {
		const parsed = Date.parse(lastLogin);
		if (!Number.isNaN(parsed)) ms = parsed;
	}
	if (!ms) return undefined;
	const diffSec = Math.floor((Date.now() - ms) / 1000);
	if (diffSec < 60) return "刚刚在线";
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前活跃`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前活跃`;
	return `${Math.floor(diffSec / 86400)} 天前活跃`;
}

export function parseRawScruffProfile(
	p: RawScruffProfile,
	channel: SocialChannelType,
): UniversalUserProfile {
	const photos: UniversalPhoto[] = [];
	if (p.profile_photos && Array.isArray(p.profile_photos)) {
		for (const ph of p.profile_photos) {
			const thumb = buildScruffPhotoUrl(ph.thumbnail_key, "thumbnail");
			const full = buildScruffPhotoUrl(ph.fullsize_key, "fullsize");
			if (thumb || full) {
				photos.push({
					fullsizeUrl: full || thumb,
					id: String(ph.id || ph.thumbnail_key),
					isAvatar: photos.length === 0,
					thumbnailUrl: thumb,
				});
			}
		}
	}

	if (
		photos.length === 0 &&
		(p.avatar_thumbnail_key || p.avatar_fullsize_key)
	) {
		const thumb = buildScruffPhotoUrl(p.avatar_thumbnail_key, "thumbnail");
		const full = buildScruffPhotoUrl(
			p.avatar_fullsize_key || p.avatar_thumbnail_key,
			"fullsize",
		);
		photos.push({ fullsizeUrl: full, isAvatar: true, thumbnailUrl: thumb });
	}

	const socialLinks: UniversalSocialLink[] = [];
	if (p.urls && Array.isArray(p.urls)) {
		for (const u of p.urls) {
			const opt = SOCIAL_SERVICES[u.service];
			if (opt && u.url) {
				const clean = u.url.replace(/^@/, "");
				const href = /^https?:\/\//i.test(clean)
					? clean
					: `${opt.baseUrl}${encodeURIComponent(clean)}`;
				socialLinks.push({
					label: opt.label,
					service: opt.label.toLowerCase(),
					url: href,
				});
			}
		}
	}

	const communityTags: string[] = [];
	if (p.community && Array.isArray(p.community)) {
		for (const cId of p.community) {
			const label = COMMUNITY_LABELS[cId];
			if (label) communityTags.push(label);
		}
	}

	const ethnicity =
		p.ethnicity && ETHNICITY_LABELS[p.ethnicity]
			? ETHNICITY_LABELS[p.ethnicity]
			: undefined;
	const bodyHair =
		p.body_hair && BODY_HAIR_LABELS[p.body_hair]
			? BODY_HAIR_LABELS[p.body_hair]
			: undefined;
	const rolePreference =
		p.sex_preferences && SEX_PREFERENCE_LABELS[p.sex_preferences]
			? SEX_PREFERENCE_LABELS[p.sex_preferences]
			: undefined;
	const relationshipStatus =
		p.relationship_status &&
		RELATIONSHIP_STATUS_LABELS[p.relationship_status]
			? RELATIONSHIP_STATUS_LABELS[p.relationship_status]
			: undefined;

	const rawRecord = p as unknown as Record<string, unknown>;
	const rawHeight = p.height ?? rawRecord.heightCm ?? rawRecord.height_cm;
	let heightCm: number | undefined;
	if (rawHeight !== undefined && rawHeight !== null) {
		const numHeight =
			typeof rawHeight === "string"
				? parseFloat(rawHeight)
				: Number(rawHeight);
		if (!Number.isNaN(numHeight)) {
			const inCm = numHeight < 3 ? numHeight * 100 : numHeight;
			heightCm = Number(inCm.toFixed(1));
		}
	}

	const rawWeight = p.weight_kg ?? rawRecord.weight ?? rawRecord.weightKg;
	let weightKg: number | undefined;
	if (rawWeight !== undefined && rawWeight !== null) {
		const numWeight =
			typeof rawWeight === "string"
				? parseFloat(rawWeight)
				: Number(rawWeight);
		if (!Number.isNaN(numWeight)) {
			weightKg = Number(numWeight.toFixed(1));
		}
	}

	const online = isScruffUserOnline(p);
	const lastActiveText = online ? "当前在线" : formatScruffLastActive(p);

	return {
		about: p.about || undefined,
		age: p.age,
		bodyHair,
		channel,
		communityTags,
		displayName: p.name || `User ${p.id}`,
		distanceMeters:
			p.distance !== undefined ? Math.round(p.distance * 1000) : null,
		distanceText:
			p.distance !== undefined
				? `${p.distance.toFixed(1)} km`
				: undefined,
		ethnicity,
		heightCm,
		id: String(p.id),
		isOnline: online,
		lastActiveText,
		photos,
		rawPayload: p,
		relationshipStatus,
		rolePreference,
		socialLinks,
		weightKg,
	};
}

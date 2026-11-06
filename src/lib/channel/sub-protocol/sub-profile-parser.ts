import type {
	UniversalGridUser,
	UniversalPhoto,
	UniversalUserProfile,
} from "../types";

export const DEFAULT_SUB_MEDIA_BASE_URL =
	"https://images.sublifeapp.com/images";

/**
 * 将 Sub 相对媒体路径规范化为完整图片 URL
 */
export function subMediaUrl(urlOrPath?: string | null): string {
	if (!urlOrPath) return "";
	const trimmed = urlOrPath.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	return `${DEFAULT_SUB_MEDIA_BASE_URL}/${trimmed.replace(/^\/+/, "")}`;
}

export interface RawSubProfile {
	id?: string | number;
	userId?: string | number;
	user_id?: string | number;
	userName?: string;
	user_name?: string;
	name?: string;
	nickname?: string;
	phone?: string;
	avatar?: string;
	avatarUrl?: string;
	gender?: number | string;
	genderText?: string;
	targetGender?: number | string;
	userTag?: number | string;
	user_tag?: number | string;
	userTagText?: string;
	height?: number | string;
	weight?: number | string;
	personalityType?: string;
	holdCredit?: number;
	province?: string;
	city?: string;
	nationality?: string;
	birthday?: number | string;
	lat?: string | number;
	lng?: string | number;
	addr?: string;
	isOnline?: boolean | number | string;
	online?: boolean;
	lastActiveTime?: number | string;
	lastActiveTimeText?: string;
	biography?: string;
	about?: string;
	detailAll?: Record<string, unknown> | string;
	photos?: Array<{ url?: string; thumbnail?: string } | string>;
	[key: string]: unknown;
}

/**
 * 格式化 Sub 属性偏好标签 (S / M / Switch / 未决定)
 */
export function formatSubRole(
	userTag?: number | string | null,
): string | undefined {
	if (userTag === undefined || userTag === null) return undefined;
	const tagNum = Number(userTag);
	switch (tagNum) {
		case 1:
			return "S";
		case 2:
			return "M";
		case 3:
			return "Switch";
		case 4:
			return "未决定";
		default: {
			const str = String(userTag).trim();
			return str && str !== "0" && str !== "-" ? str : undefined;
		}
	}
}

/**
 * 格式化 Sub 性别
 */
export function formatSubGender(gender?: number | string | null): string {
	const gNum = Number(gender);
	if (gNum === 1) return "男";
	if (gNum === 2) return "女";
	return "未知";
}

/**
 * 提取 Sub 用户照片列表
 */
export function extractSubPhotos(raw: RawSubProfile): UniversalPhoto[] {
	const photos: UniversalPhoto[] = [];
	const seen = new Set<string>();

	const addPhoto = (pathOrUrl?: string | null, isAvatar = false) => {
		if (!pathOrUrl) return;
		const fullUrl = subMediaUrl(pathOrUrl);
		if (!fullUrl || seen.has(fullUrl)) return;
		seen.add(fullUrl);
		photos.push({ fullsizeUrl: fullUrl, thumbnailUrl: fullUrl, isAvatar });
	};

	// 1. detailAll 预解析
	let detailObj: Record<string, unknown> | null = null;
	if (raw.detailAll) {
		if (typeof raw.detailAll === "string") {
			try {
				detailObj = JSON.parse(raw.detailAll) as Record<
					string,
					unknown
				>;
			} catch {
				// ignore
			}
		} else if (
			typeof raw.detailAll === "object" &&
			raw.detailAll !== null
		) {
			detailObj = raw.detailAll;
		}
	}

	const avatarImageObj = detailObj?.avatarImage as
		| Record<string, unknown>
		| undefined;

	// 2. 头像提取
	const avatar =
		raw.avatar ||
		raw.avatarUrl ||
		(avatarImageObj?.saveAddr as string | undefined) ||
		(avatarImageObj?.webAddr as string | undefined);
	if (typeof avatar === "string") {
		addPhoto(avatar, true);
	}

	// 3. detailAll 内照片解析
	if (detailObj) {
		const avatarImage = detailObj.avatarImage as
			| Record<string, unknown>
			| undefined;
		if (avatarImage) {
			if (typeof avatarImage.webAddr === "string")
				addPhoto(avatarImage.webAddr);
			if (typeof avatarImage.saveAddr === "string")
				addPhoto(avatarImage.saveAddr);
		}

		// 照片墙 / 动态图片
		const photoList =
			detailObj.photos || detailObj.album || detailObj.photoWall;
		if (Array.isArray(photoList)) {
			for (const item of photoList) {
				if (typeof item === "string") {
					addPhoto(item);
				} else if (item && typeof item === "object") {
					const rec = item as Record<string, unknown>;
					const u = (rec.url ||
						rec.webAddr ||
						rec.saveAddr ||
						rec.thumbnail) as string | undefined;
					if (u) addPhoto(u);
				}
			}
		}
	}

	// 3. 根级 photos 数组
	if (Array.isArray(raw.photos)) {
		for (const p of raw.photos) {
			if (typeof p === "string") {
				addPhoto(p);
			} else if (p && typeof p === "object") {
				addPhoto(p.url || p.thumbnail);
			}
		}
	}

	return photos;
}

/**
 * 将 Sub 原始资料反序列化为通用 UniversalUserProfile 模型
 */
export function parseRawSubProfile(raw: RawSubProfile): UniversalUserProfile {
	const id = String(raw.userId || raw.user_id || raw.id || "");
	const displayName =
		raw.userName ||
		raw.user_name ||
		raw.name ||
		raw.nickname ||
		(id ? `Sub ${id}` : "Sub User");

	const photos = extractSubPhotos(raw);

	// 解析标签
	const communityTags: string[] = [];
	const roleTag = formatSubRole(raw.userTag ?? raw.user_tag);
	if (roleTag) communityTags.push(roleTag);
	if (
		raw.city &&
		typeof raw.city === "string" &&
		raw.city.trim() &&
		raw.city !== "???"
	) {
		communityTags.push(raw.city.trim());
	}
	if (
		raw.personalityType &&
		typeof raw.personalityType === "string" &&
		raw.personalityType.trim()
	) {
		communityTags.push(`MBTI:${raw.personalityType.trim()}`);
	}

	// 身高 / 体重
	let heightCm: number | null = null;
	if (raw.height !== undefined && raw.height !== null) {
		const h = Number(raw.height);
		if (!Number.isNaN(h) && h >= 100 && h <= 250) {
			heightCm = h;
		}
	}

	let weightKg: number | null = null;
	if (raw.weight !== undefined && raw.weight !== null) {
		const w = Number(raw.weight);
		if (!Number.isNaN(w) && w >= 30 && w <= 200) {
			weightKg = w;
		}
	}

	// 年龄计算
	let age: number | null = null;
	if (raw.age !== undefined && raw.age !== null) {
		const a = Number(raw.age);
		if (!Number.isNaN(a) && a > 0) age = a;
	} else if (raw.birthday !== undefined && raw.birthday !== null) {
		const bTs = Number(raw.birthday);
		if (!Number.isNaN(bTs) && bTs > 0) {
			const birthYear = new Date(bTs).getFullYear();
			const nowYear = new Date().getFullYear();
			if (nowYear > birthYear && nowYear - birthYear < 100) {
				age = nowYear - birthYear;
			}
		}
	}

	const isOnline = Boolean(
		raw.isOnline === 1 ||
		raw.isOnline === "1" ||
		raw.isOnline === true ||
		raw.online === true,
	);

	let lastActiveText: string | undefined;
	if (isOnline) {
		lastActiveText = "当前在线";
	} else if (raw.lastActiveTimeText) {
		lastActiveText = String(raw.lastActiveTimeText);
	} else if (raw.lastActiveTime) {
		const ts = Number(raw.lastActiveTime);
		if (!Number.isNaN(ts) && ts > 0) {
			const timeMs = ts > 1e11 ? ts : ts * 1000;
			const diffMins = Math.round((Date.now() - timeMs) / (60 * 1000));
			if (diffMins < 60) {
				lastActiveText = `${Math.max(1, diffMins)} 分钟前活跃`;
			} else if (diffMins < 1440) {
				lastActiveText = `${Math.round(diffMins / 60)} 小时前活跃`;
			} else {
				lastActiveText = `${Math.round(diffMins / 1440)} 天前活跃`;
			}
		}
	}

	const about = raw.biography || raw.about || undefined;

	return {
		about,
		age,
		channel: "sub",
		communityTags: communityTags.length > 0 ? communityTags : undefined,
		displayName,
		heightCm,
		id,
		isOnline,
		lastActiveText,
		photos,
		rawPayload: raw,
		relationshipStatus: raw.personalityType || undefined,
		rolePreference: roleTag,
		weightKg,
	};
}

/**
 * 将 Sub 原始资料转换为网格展示用户模型
 */
export function parseSubGridUser(raw: RawSubProfile): UniversalGridUser {
	const parsed = parseRawSubProfile(raw);
	const thumbUrl =
		parsed.photos[0]?.thumbnailUrl ||
		subMediaUrl(raw.avatar || raw.avatarUrl) ||
		"";
	const fullUrl = parsed.photos[0]?.fullsizeUrl || thumbUrl;

	return {
		age: parsed.age,
		avatarFullUrl: fullUrl || undefined,
		avatarThumbnailUrl: thumbUrl,
		channel: "sub",
		displayName: parsed.displayName,
		distanceMeters: parsed.distanceMeters,
		distanceText: parsed.distanceText,
		headline: parsed.about,
		id: parsed.id,
		isOnline: parsed.isOnline,
		lastSeenText: parsed.lastActiveText,
		rawPayload: raw,
		tags: parsed.communityTags,
	};
}

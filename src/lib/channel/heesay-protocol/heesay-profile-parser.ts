import type { UniversalPhoto, UniversalUserProfile } from "../types";

export interface RawHeesayProfile {
	uid?: string | number;
	user_id?: string | number;
	id?: string | number;
	name?: string;
	nickname?: string;
	avatar?: string;
	raw_avatar?: string;
	age?: number | string;
	height?: number | string;
	weight?: number | string;
	role?: string | number;
	description?: string;
	sign?: string;
	about_me?: string;
	distance?: number | string;
	online_state?: number | string | boolean;
	city_settled?: string;
	city_settled_name?: string;
	looking_for?: string[] | string;
	tags_oversea?: { looking_for?: string[]; [key: string]: unknown };
	avatar_list?: Array<
		{ avatar?: string; url?: string; avatar_thumb?: string } | string
	>;
	avatars?: Array<
		{ avatar?: string; url?: string; avatar_thumb?: string } | string
	>;
	albums?: Array<unknown>;
	album?: Array<{
		id?: string | number;
		url?: string;
		thumbnail?: string;
		avatar?: string;
		[key: string]: unknown;
	}>;
	privacy_photos?: Array<unknown>;
	vice_avatar?: string;
	photos_count?: number;
	education?: string;
	hometown?: string;
	lang?: string;
	languages_text?: string;
	relationship?: string;
	[key: string]: unknown;
}

/**
 * 格式化 Heesay 角色偏好展示文本
 */
export function formatHeesayRole(
	role?: string | number | null,
): string | undefined {
	if (role === undefined || role === null) return undefined;
	const str = String(role).trim();
	if (str === "1" || str === "1号" || str.toLowerCase() === "top")
		return "1号 (Top)";
	if (str === "0" || str === "0号" || str.toLowerCase() === "bottom")
		return "0号 (Bottom)";
	if (str === "0.5" || str.toLowerCase() === "versatile")
		return "0.5 (Versatile)";
	if (str === "-1" || str === "保密") return "保密";
	return str || undefined;
}

/**
 * 解析并提取 Heesay 照片列表
 */
export function extractHeesayPhotos(raw: RawHeesayProfile): UniversalPhoto[] {
	const photos: UniversalPhoto[] = [];
	const seenUrls = new Set<string>();

	const addPhoto = (url: string | undefined, isAvatar = false) => {
		if (!url || typeof url !== "string") return;
		const trimmed = url.trim();
		if (!trimmed || !trimmed.startsWith("http") || seenUrls.has(trimmed))
			return;
		seenUrls.add(trimmed);
		photos.push({ fullsizeUrl: trimmed, thumbnailUrl: trimmed, isAvatar });
	};

	// 1. 首选主头像
	const mainAvatar = raw.avatar || raw.raw_avatar;
	if (mainAvatar) {
		addPhoto(mainAvatar, true);
	}

	// 2. 副头像
	if (raw.vice_avatar) {
		addPhoto(raw.vice_avatar);
	}

	// 3. 提取 avatar_list / avatars
	const list = raw.avatar_list || raw.avatars;
	if (Array.isArray(list)) {
		for (const item of list) {
			if (typeof item === "string") {
				addPhoto(item);
			} else if (item && typeof item === "object") {
				addPhoto(item.url || item.avatar || item.avatar_thumb);
			}
		}
	}

	// 4. 提取相册 album 与动态照片 ticktocks
	if (Array.isArray(raw.album)) {
		for (const item of raw.album) {
			if (item && typeof item === "object") {
				const obj = item as Record<string, unknown>;
				const url =
					(typeof obj.url === "string" ? obj.url : "") ||
					(typeof obj.thumbnail === "string" ? obj.thumbnail : "") ||
					(typeof obj.avatar === "string" ? obj.avatar : "");
				addPhoto(url);
			}
		}
	}

	if (Array.isArray(raw.ticktocks)) {
		for (const item of raw.ticktocks) {
			if (item && typeof item === "object") {
				const obj = item as Record<string, unknown>;
				const url =
					(typeof obj.url === "string" ? obj.url : "") ||
					(typeof obj.thumbnail === "string" ? obj.thumbnail : "") ||
					(typeof obj.avatar === "string" ? obj.avatar : "");
				addPhoto(url);
			}
		}
	}

	return photos;
}

/**
 * 将中继返回的 Heesay 原始资料反序列化为通用 UniversalUserProfile 模型
 */
export function parseRawHeesayProfile(
	raw: RawHeesayProfile,
): UniversalUserProfile {
	const id = String(raw.uid || raw.user_id || raw.id || "");
	const displayName =
		raw.name || raw.nickname || (id ? `Heesay ${id}` : "Heesay User");
	const photos = extractHeesayPhotos(raw);

	// 解析标签
	let communityTags: string[] = [];
	if (Array.isArray(raw.looking_for)) {
		communityTags = raw.looking_for.filter(
			(t): t is string => typeof t === "string",
		);
	} else if (typeof raw.looking_for === "string" && raw.looking_for.trim()) {
		communityTags = [raw.looking_for.trim()];
	} else if (
		raw.tags_oversea?.looking_for &&
		Array.isArray(raw.tags_oversea.looking_for)
	) {
		communityTags = raw.tags_oversea.looking_for.filter(
			(t): t is string => typeof t === "string",
		);
	}

	// 身高/体重解析 (Heesay 已经是 cm / kg 整数)
	const heightCm =
		raw.height !== undefined &&
		raw.height !== null &&
		!Number.isNaN(Number(raw.height))
			? Number(raw.height)
			: null;
	const weightKg =
		raw.weight !== undefined &&
		raw.weight !== null &&
		!Number.isNaN(Number(raw.weight))
			? Number(raw.weight)
			: null;

	const ageNum =
		raw.age !== undefined &&
		raw.age !== null &&
		!Number.isNaN(Number(raw.age))
			? Number(raw.age)
			: null;

	const distRaw =
		raw.distance !== undefined && raw.distance !== null
			? Number(raw.distance)
			: null;
	const distanceMeters =
		distRaw !== null && !Number.isNaN(distRaw)
			? Math.round(distRaw * 1000)
			: null;
	const distanceText =
		distRaw !== null && !Number.isNaN(distRaw)
			? `${distRaw.toFixed(1)} km`
			: undefined;

	const isOnline = Boolean(
		raw.online_state === 1 ||
		raw.online_state === "1" ||
		raw.online_state === true ||
		raw.online_status === "在线",
	);

	const about = raw.description || raw.sign || raw.about_me || undefined;

	return {
		about,
		age: ageNum,
		channel: "heesay",
		communityTags: communityTags.length > 0 ? communityTags : undefined,
		displayName,
		distanceMeters,
		distanceText,
		heightCm: heightCm && heightCm > 0 ? heightCm : null,
		id,
		isOnline,
		lastActiveText: isOnline ? "当前在线" : undefined,
		photos,
		rawPayload: raw,
		relationshipStatus: raw.relationship || undefined,
		rolePreference: formatHeesayRole(raw.role),
		weightKg: weightKg && weightKg > 0 ? weightKg : null,
	};
}

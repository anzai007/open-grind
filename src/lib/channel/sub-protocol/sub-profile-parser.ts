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
	let trimmed = String(urlOrPath).trim();
	if (
		!trimmed ||
		trimmed === "0" ||
		trimmed === "null" ||
		trimmed === "undefined" ||
		trimmed === "-"
	) {
		return "";
	}

	// 纯数字 ID（如 Sub 内部 attachmentId: "1568424771448250368"）不是有效媒体路径
	if (/^\d+$/.test(trimmed)) {
		return "";
	}

	// 兼容 // 协议相对或缺失协议的前缀
	if (trimmed.startsWith("//")) {
		trimmed = `https:${trimmed}`;
	} else if (trimmed.startsWith("images.sublifeapp.com/")) {
		trimmed = `https://${trimmed}`;
	}

	if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
		return trimmed;
	}

	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		// 若为官方图片域名但缺少 /images 前缀，补齐以避开 CDN / WAF 418 拦截
		if (
			trimmed.startsWith("https://images.sublifeapp.com/") &&
			!trimmed.startsWith("https://images.sublifeapp.com/images/")
		) {
			return trimmed.replace(
				"https://images.sublifeapp.com/",
				"https://images.sublifeapp.com/images/",
			);
		}
		if (
			trimmed.startsWith("http://images.sublifeapp.com/") &&
			!trimmed.startsWith("http://images.sublifeapp.com/images/")
		) {
			return trimmed.replace(
				"http://images.sublifeapp.com/",
				"https://images.sublifeapp.com/images/",
			);
		}
		return trimmed;
	}

	// 相对路径处理
	const clean = trimmed.replace(/^\/+/, "");
	// 若已经以 images/ 开头，避免重复拼成 images/images/
	if (clean.startsWith("images/")) {
		return `https://images.sublifeapp.com/${clean}`;
	}
	return `${DEFAULT_SUB_MEDIA_BASE_URL}/${clean}`;
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
	avatarImage?: {
		attachmentId?: string | number;
		webAddr?: string;
		saveAddr?: string;
		miniImageUrl?: string;
		fileName?: string;
		[key: string]: unknown;
	};
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

	const addPhoto = (
		pathOrUrl?: string | null,
		isAvatar = false,
		thumbPathOrUrl?: string | null,
	) => {
		if (!pathOrUrl) return;
		const fullUrl = subMediaUrl(pathOrUrl);
		if (!fullUrl || seen.has(fullUrl)) return;
		seen.add(fullUrl);
		const thumbnailUrl = thumbPathOrUrl
			? subMediaUrl(thumbPathOrUrl)
			: fullUrl;
		photos.push({
			fullsizeUrl: fullUrl,
			thumbnailUrl: thumbnailUrl || fullUrl,
			isAvatar,
		});
	};

	// 1. 优先提取根级与 extUser 层的 avatarImage 对象（Sub 原生 API 最标准格式）
	const rawAvatarImage =
		raw.avatarImage ||
		(
			raw.user as
				| { extUser?: { avatarImage?: Record<string, unknown> } }
				| undefined
		)?.extUser?.avatarImage;
	if (rawAvatarImage && typeof rawAvatarImage === "object") {
		const rec = rawAvatarImage;
		const full =
			(rec.webAddr as string | undefined) ||
			(rec.saveAddr as string | undefined) ||
			(rec.miniImageUrl as string | undefined);
		const thumb =
			(rec.miniImageUrl as string | undefined) ||
			(rec.webAddr as string | undefined) ||
			(rec.saveAddr as string | undefined);
		if (full) {
			addPhoto(full, true, thumb);
		}
	}

	// 2. detailAll 预解析
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

	if (detailObj) {
		const avatarImage = detailObj.avatarImage as
			| Record<string, unknown>
			| undefined;
		if (avatarImage && typeof avatarImage === "object") {
			const full =
				(avatarImage.webAddr as string | undefined) ||
				(avatarImage.saveAddr as string | undefined) ||
				(avatarImage.miniImageUrl as string | undefined);
			const thumb =
				(avatarImage.miniImageUrl as string | undefined) ||
				(avatarImage.webAddr as string | undefined) ||
				(avatarImage.saveAddr as string | undefined);
			if (full) {
				addPhoto(full, true, thumb);
			}
		}

		if (typeof detailObj.avatarUrl === "string") {
			addPhoto(detailObj.avatarUrl, true);
		}

		if (
			typeof detailObj.avatar === "string" &&
			!/^\d+$/.test(detailObj.avatar.trim())
		) {
			addPhoto(detailObj.avatar, true);
		}

		// 照片墙 / 动态图片 / 相册
		const photoList =
			detailObj.photos || detailObj.album || detailObj.photoWall;
		if (Array.isArray(photoList)) {
			for (const item of photoList) {
				if (typeof item === "string") {
					addPhoto(item);
				} else if (item && typeof item === "object") {
					const rec = item as Record<string, unknown>;
					const f = rec.file as Record<string, unknown> | undefined;
					const u = (f?.webAddr ||
						f?.saveAddr ||
						rec.url ||
						rec.webAddr ||
						rec.saveAddr ||
						rec.thumbnail) as string | undefined;
					const thumb = (f?.miniImageUrl || rec.thumbnail || u) as
						| string
						| undefined;
					if (u)
						addPhoto(
							u,
							rec.isAvatar === "1" || rec.isAvatar === 1,
							thumb,
						);
				}
			}
		}
	}

	// 3. 根级 avatarUrl 或非纯数字 avatar
	if (typeof raw.avatarUrl === "string") {
		addPhoto(raw.avatarUrl, true);
	}
	if (typeof raw.avatar === "string" && !/^\d+$/.test(raw.avatar.trim())) {
		addPhoto(raw.avatar, true);
	}

	// 4. 单张相册记录结构 (如 appUserPhoto/findList 项的 item.file)
	if (raw.file && typeof raw.file === "object") {
		const f = raw.file as Record<string, unknown>;
		const u = (f.webAddr || f.saveAddr || f.miniImageUrl) as
			| string
			| undefined;
		const thumb = (f.miniImageUrl || f.webAddr || f.saveAddr) as
			| string
			| undefined;
		if (u) addPhoto(u, raw.isAvatar === "1" || raw.isAvatar === 1, thumb);
	}

	// 5. 根级 photos / albumList 数组
	const directList = Array.isArray(raw.photos)
		? raw.photos
		: Array.isArray(raw.albumList)
			? raw.albumList
			: undefined;
	if (directList) {
		for (const p of directList) {
			if (typeof p === "string") {
				addPhoto(p);
			} else if (p && typeof p === "object") {
				const rec = p as Record<string, unknown>;
				const f = rec.file as Record<string, unknown> | undefined;
				const u = (f?.webAddr ||
					f?.saveAddr ||
					rec.url ||
					rec.thumbnail ||
					rec.webAddr ||
					rec.saveAddr) as string | undefined;
				const thumb = (f?.miniImageUrl || rec.thumbnail || u) as
					| string
					| undefined;
				if (u)
					addPhoto(
						u,
						rec.isAvatar === "1" || rec.isAvatar === 1,
						thumb,
					);
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

	// 距离解析 (Sub 附近用户 findList 返回 gps 字段，单位为米)
	let distanceMeters: number | null = null;
	if (typeof raw.gps === "number" && !Number.isNaN(raw.gps) && raw.gps >= 0) {
		distanceMeters = Math.round(raw.gps);
	} else if (
		typeof raw.distance === "number" &&
		!Number.isNaN(raw.distance) &&
		raw.distance >= 0
	) {
		distanceMeters = Math.round(raw.distance);
	} else if (typeof raw.gps === "string" && raw.gps.trim()) {
		const parsedGps = parseFloat(raw.gps);
		if (!Number.isNaN(parsedGps) && parsedGps >= 0) {
			distanceMeters = Math.round(parsedGps);
		}
	}

	let distanceText: string | undefined =
		typeof raw.distanceText === "string"
			? raw.distanceText
			: typeof raw.distanceText === "number"
				? String(raw.distanceText)
				: undefined;
	if (!distanceText && distanceMeters !== null) {
		if (distanceMeters < 100) {
			distanceText = "< 100 m";
		} else if (distanceMeters < 1000) {
			distanceText = `${distanceMeters} m`;
		} else {
			distanceText = `${(distanceMeters / 1000).toFixed(1)} km`;
		}
	}

	return {
		about,
		age,
		channel: "sub",
		communityTags: communityTags.length > 0 ? communityTags : undefined,
		displayName,
		distanceMeters,
		distanceText,
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
	const rawAvatarImage =
		raw.avatarImage ||
		(
			raw.user as
				| { extUser?: { avatarImage?: Record<string, unknown> } }
				| undefined
		)?.extUser?.avatarImage;
	const candidateRawAvatar =
		(rawAvatarImage?.miniImageUrl as string | undefined) ||
		(rawAvatarImage?.webAddr as string | undefined) ||
		(rawAvatarImage?.saveAddr as string | undefined) ||
		raw.avatarUrl ||
		(raw.avatar && !/^\d+$/.test(String(raw.avatar).trim())
			? String(raw.avatar)
			: undefined);

	const thumbUrl =
		parsed.photos[0]?.thumbnailUrl ||
		parsed.photos[0]?.fullsizeUrl ||
		subMediaUrl(candidateRawAvatar) ||
		"";
	const fullUrl =
		parsed.photos[0]?.fullsizeUrl ||
		parsed.photos[0]?.thumbnailUrl ||
		thumbUrl;

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

export const SCRUFF_MEDIA_BASE_URL = "https://cdn-profilemedia.scruffapp.com/";

export const ETHNICITY_LABELS: Record<number, string> = {
	1: "亚洲裔人",
	2: "黑人",
	3: "拉美裔 / 拉丁美洲人",
	4: "南亚人",
	5: "中东裔人",
	6: "太平洋岛裔人",
	7: "白人",
	8: "美洲原住民",
	9: "混血儿",
};

export const BODY_HAIR_LABELS: Record<number, string> = {
	1: "无毛",
	2: "有些体毛",
	3: "多毛",
	4: "毛发很多",
};

export const SEX_PREFERENCE_LABELS: Record<number, string> = {
	1: "1号",
	2: "0号",
	3: "0.5",
	4: "不肛交",
	5: "口交",
	6: "恋物",
	7: "无性",
};

export const RELATIONSHIP_STATUS_LABELS: Record<number, string> = {
	1: "单身",
	2: "约会中",
	3: "交往中",
	4: "已有男朋友",
	5: "已订婚",
	6: "已婚",
	7: "开放性关系",
	8: "多元之爱关系",
	9: "寡居",
};

export const COMMUNITY_LABELS: Record<number, string> = {
	1: "熊",
	2: "军警系",
	3: "体育生",
	4: "肌肉男",
	5: "皮革族",
	6: "宅男",
	7: "大学生",
	8: "跨性别",
	9: "正太",
	10: "HIV 阳性者",
	12: "熟男",
	14: "深柜",
	15: "酷儿",
	16: "双性恋",
	17: "胖熊",
	18: "变装",
	19: "特定控",
	20: "邻家男生",
	21: "狼狗",
};

export const SOCIAL_SERVICES: Record<
	number,
	{ label: string; baseUrl: string }
> = {
	2: { label: "Facebook", baseUrl: "https://www.facebook.com/" },
	3: { label: "X", baseUrl: "https://x.com/" },
	4: { label: "Instagram", baseUrl: "https://www.instagram.com/" },
	10: { label: "TikTok", baseUrl: "https://www.tiktok.com/@" },
};

export function buildScruffPhotoUrl(
	photoKey: unknown,
	_variant?: "thumbnail" | "fullsize",
): string {
	void _variant;
	if (!photoKey || typeof photoKey !== "string") return "";
	const key = photoKey.trim();
	if (!key) return "";
	if (/^https?:\/\//i.test(key)) return key;
	return `${SCRUFF_MEDIA_BASE_URL}${key.replace(/^\/+/, "")}`;
}

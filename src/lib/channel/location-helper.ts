import {
	COUNTRIES,
	findLocationInfo,
	getDistanceKm,
} from "$lib/components/location-chooser/cities";
import { decodeGeohash, encodeGeohash } from "$lib/model/geohash";
import type { ChannelAccount } from "./types";

/**
 * 转换 Geohash 为人类可读的城市/区域名称（如 "🇮🇳 孟买" 或 "19.08°N, 72.88°E"）
 */
export function getGeohashLocationLabel(
	geohash: string | null | undefined,
): string {
	if (!geohash) return "未设置定位";
	try {
		const { lat, lon } = decodeGeohash(geohash);
		const info = findLocationInfo(lat, lon);
		if (info.city) {
			return `${info.flag ? `${info.flag} ` : ""}${info.city}`;
		}
		return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
	} catch {
		return geohash.slice(0, 8);
	}
}

/**
 * 根据城市/区域名称（如 "日本东京"、"日本·东京"、"🇯🇵 东京"、"Tokyo"）反查标准 Geohash
 */
export function findGeohashByLocationName(name?: string | null): string | null {
	if (!name || typeof name !== "string") return null;
	const clean = name
		.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}]/gu, "")
		.replace(/[·,\s]/g, "")
		.trim()
		.toLowerCase();
	if (!clean) return null;

	for (const country of COUNTRIES) {
		for (const city of country.cities) {
			const cityName = city.name.toLowerCase();
			const cityNameEn = (city.nameEn ?? "").toLowerCase();
			const countryName = country.name.toLowerCase();
			const countryNameEn = country.nameEn.toLowerCase();

			if (
				clean === cityName ||
				clean === cityNameEn ||
				clean === `${countryName}${cityName}` ||
				clean === `${countryNameEn}${cityNameEn}` ||
				clean.includes(cityName) ||
				(cityNameEn && clean.includes(cityNameEn)) ||
				city.aliases?.some((a) => clean.includes(a.toLowerCase()))
			) {
				return encodeGeohash({ lat: city.lat, lon: city.lon });
			}
		}
	}
	return null;
}

/**
 * 解析并保障账号的有效 Geohash：
 * 1. 优先使用账号已绑定的 lastGeohash；
 * 2. 检测并自愈历史逻辑缺陷可能导致的异地污染（如账号名为"日本东京"但坐标在德国）；
 * 3. 若无有效 lastGeohash，尝试从 lastLocationName 推导；
 * 4. 兜底返回 fallbackGeohash。
 */
export function resolveGeohashForAccount(
	account?: ChannelAccount | null,
	fallbackGeohash?: string | null,
): string {
	if (!account) return fallbackGeohash ?? "";

	if (account.lastGeohash) {
		if (account.lastLocationName) {
			try {
				const { lat, lon } = decodeGeohash(account.lastGeohash);
				const targetGeohash = findGeohashByLocationName(
					account.lastLocationName,
				);
				if (targetGeohash) {
					const targetCoord = decodeGeohash(targetGeohash);
					const dist = getDistanceKm(
						lat,
						lon,
						targetCoord.lat,
						targetCoord.lon,
					);
					// 距离差异超过 3000 公里，说明坐标与绑定的城市名称发生严重错位（被异地切换覆盖污染）
					if (dist > 3000) {
						account.lastGeohash = targetGeohash;
						return targetGeohash;
					}
				}
			} catch {
				// decode 失败则进入后续名称推导
			}
		}
		return account.lastGeohash;
	}

	if (account.lastLocationName) {
		const matched = findGeohashByLocationName(account.lastLocationName);
		if (matched) {
			account.lastGeohash = matched;
			return matched;
		}
	}

	return fallbackGeohash ?? "";
}

import { findLocationInfo } from "$lib/components/location-chooser/cities";
import { decodeGeohash } from "$lib/model/geohash";

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

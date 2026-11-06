import { invoke } from "@tauri-apps/api/core";

import { isTauriEnvironment } from "../scruff-protocol/relay-client";

const subImageDataUrlCache = new Map<string, string>();
const inFlightFetches = new Map<string, Promise<string>>();

/**
 * 将 Sub 图片 URL 转换为 Tauri 内可正常显示的 Data URL（绕过 WebKit 对 Content-Disposition: attachment 的拦截）
 */
export async function resolveSubImageDataUrl(
	url?: string | null,
): Promise<string> {
	if (!url) return "";
	const trimmed = String(url).trim();
	if (!trimmed || !trimmed.startsWith("https://images.sublifeapp.com/")) {
		return trimmed;
	}

	const cached = subImageDataUrlCache.get(trimmed);
	if (cached) {
		return cached;
	}

	if (!isTauriEnvironment()) {
		return trimmed;
	}

	const inFlight = inFlightFetches.get(trimmed);
	if (inFlight) {
		return inFlight;
	}

	const promise = (async () => {
		try {
			const dataUrl = await invoke<string>("fetch_image_data_url", {
				url: trimmed,
			});
			if (dataUrl && dataUrl.startsWith("data:")) {
				subImageDataUrlCache.set(trimmed, dataUrl);
				return dataUrl;
			}
		} catch (err) {
			console.warn(
				"Failed to fetch Sub image as data url:",
				trimmed,
				err,
			);
		} finally {
			inFlightFetches.delete(trimmed);
		}
		return trimmed;
	})();

	inFlightFetches.set(trimmed, promise);
	return promise;
}

/**
 * 针对网格用户列表批量预解析头像 Data URL
 */
export async function hydrateSubGridAvatars<
	T extends { avatarThumbnailUrl?: string },
>(items: T[]): Promise<T[]> {
	if (!isTauriEnvironment() || items.length === 0) return items;
	await Promise.allSettled(
		items.map(async (item) => {
			if (
				item.avatarThumbnailUrl &&
				item.avatarThumbnailUrl.startsWith(
					"https://images.sublifeapp.com/",
				)
			) {
				const dataUrl = await resolveSubImageDataUrl(
					item.avatarThumbnailUrl,
				);
				if (dataUrl && dataUrl.startsWith("data:")) {
					item.avatarThumbnailUrl = dataUrl;
				}
			}
		}),
	);
	return items;
}

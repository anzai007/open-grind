import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { channelState } from "./channel-state.svelte";
import type { UniversalGridUser } from "./types";

export class ChannelGridState {
	items = $state<UniversalGridUser[]>([]);
	loading = $state(false);
	refreshing = $state(false);
	isLoadingMore = $state(false);
	error = $state<string | null>(null);
	offset = $state(0);
	hasNext = $state(true);

	private currentLat: number | null = null;
	private currentLon: number | null = null;
	private currentFilterTags: string[] | undefined = undefined;
	private currentCacheKey: string | null = null;
	private gridMemoryCache = new SvelteMap<string, UniversalGridUser[]>();

	private computeCacheKey(
		lat: number,
		lon: number,
		filterTags?: string[],
		geohash?: string,
	): string {
		const channel = channelState.activeChannel;
		const accountId = channelState.currentAccount?.id ?? "";
		const locKey = geohash ?? `${lat.toFixed(4)},${lon.toFixed(4)}`;
		const tagsKey = (filterTags ?? []).join(",");
		return `${channel}:${accountId}:${locKey}:${tagsKey}`;
	}

	clear() {
		this.items = [];
		this.offset = 0;
		this.hasNext = true;
		this.error = null;
		this.loading = false;
		this.refreshing = false;
		this.isLoadingMore = false;
		this.currentCacheKey = null;
	}

	clearItemsOnly() {
		this.items = [];
		this.offset = 0;
		this.hasNext = true;
		this.error = null;
	}

	findCachedUser(userId: string): UniversalGridUser | undefined {
		const inCurrent = this.items.find((u) => u.id === userId);
		if (inCurrent) return inCurrent;
		for (const list of this.gridMemoryCache.values()) {
			const found = list.find((u) => u.id === userId);
			if (found) return found;
		}
		return undefined;
	}

	async load(
		lat: number,
		lon: number,
		filterTags?: string[],
		geohash?: string,
		force = false,
	): Promise<void> {
		const cacheKey = this.computeCacheKey(lat, lon, filterTags, geohash);

		// 1. 如果当前展示的正是该渠道/账号/定位点的数据，且不是强制刷新，立即跳过重载（保持视图与滚动状态）
		if (
			!force &&
			this.currentCacheKey === cacheKey &&
			this.items.length > 0
		) {
			return;
		}

		// 2. 如果之前访问过并缓存了该位置数据，直接秒开恢复，避免空白闪烁
		if (!force && this.gridMemoryCache.has(cacheKey)) {
			this.currentLat = lat;
			this.currentLon = lon;
			this.currentFilterTags = filterTags;
			this.currentCacheKey = cacheKey;
			this.items = this.gridMemoryCache.get(cacheKey)!;
			this.loading = false;
			return;
		}

		if (
			this.loading &&
			this.currentLat === lat &&
			this.currentLon === lon &&
			this.currentCacheKey === cacheKey
		) {
			return;
		}

		this.currentLat = lat;
		this.currentLon = lon;
		this.currentFilterTags = filterTags;
		this.currentCacheKey = cacheKey;
		this.clearItemsOnly();
		this.loading = true;

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const res = await provider.getNearbyUsers({
				lat,
				lon,
				offset: 0,
				filterTags,
				account,
			});

			this.items = res.items;
			this.gridMemoryCache.set(cacheKey, res.items);
			this.offset = res.nextOffset ?? (res.items.length > 0 ? 100 : 0);
			this.hasNext = Boolean(res.hasNext && (res.nextOffset ?? 0) < 2000);
			this.error = null;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	}

	async loadMore(): Promise<void> {
		if (
			this.loading ||
			this.isLoadingMore ||
			!this.hasNext ||
			this.items.length === 0 ||
			this.currentLat === null ||
			this.currentLon === null
		) {
			return;
		}

		// 单个定位点最多翻到第 20 页 (offset 达到 2000 则停止)
		if (this.offset >= 2000) {
			this.hasNext = false;
			return;
		}

		this.isLoadingMore = true;

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const res = await provider.getNearbyUsers({
				lat: this.currentLat,
				lon: this.currentLon,
				offset: this.offset,
				filterTags: this.currentFilterTags,
				account,
			});

			const existingIds = new SvelteSet(this.items.map((u) => u.id));
			const newItems = res.items.filter((u) => !existingIds.has(u.id));

			this.items = [...this.items, ...newItems];
			if (this.currentCacheKey) {
				this.gridMemoryCache.set(this.currentCacheKey, this.items);
			}

			const nextOffset =
				res.nextOffset ??
				(res.items.length > 0 ? this.offset + 100 : this.offset);
			this.offset = nextOffset;
			this.hasNext = Boolean(
				res.hasNext && res.items.length > 0 && nextOffset < 2000,
			);
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.isLoadingMore = false;
		}
	}

	async refresh(): Promise<void> {
		if (this.currentLat === null || this.currentLon === null) return;
		this.refreshing = true;

		try {
			const provider = channelState.currentProvider;
			const account = channelState.currentAccount;
			const res = await provider.getNearbyUsers({
				lat: this.currentLat,
				lon: this.currentLon,
				offset: 0,
				filterTags: this.currentFilterTags,
				account,
			});

			this.items = res.items;
			if (this.currentCacheKey) {
				this.gridMemoryCache.set(this.currentCacheKey, res.items);
			}
			this.offset = res.nextOffset ?? (res.items.length > 0 ? 100 : 0);
			this.hasNext = Boolean(res.hasNext && (res.nextOffset ?? 0) < 2000);
			this.error = null;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.refreshing = false;
		}
	}
}

export const channelGridState = new ChannelGridState();

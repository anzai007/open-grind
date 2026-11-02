import { SvelteSet } from "svelte/reactivity";

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

	clear() {
		this.items = [];
		this.offset = 0;
		this.hasNext = true;
		this.error = null;
		this.loading = false;
		this.refreshing = false;
		this.isLoadingMore = false;
	}

	async load(lat: number, lon: number, filterTags?: string[]): Promise<void> {
		this.currentLat = lat;
		this.currentLon = lon;
		this.currentFilterTags = filterTags;
		this.clear();
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
			this.offset = res.nextOffset ?? (res.items.length > 0 ? 100 : 0);
			this.hasNext = res.hasNext;
			this.error = null;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	}

	async loadMore(): Promise<void> {
		if (
			this.isLoadingMore ||
			!this.hasNext ||
			this.currentLat === null ||
			this.currentLon === null
		) {
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
			this.offset =
				res.nextOffset ??
				(res.items.length > 0 ? this.offset + 100 : this.offset);
			this.hasNext = res.hasNext && res.items.length > 0;
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
			this.offset = res.nextOffset ?? (res.items.length > 0 ? 100 : 0);
			this.hasNext = res.hasNext;
			this.error = null;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.refreshing = false;
		}
	}
}

export const channelGridState = new ChannelGridState();

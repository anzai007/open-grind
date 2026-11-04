<script lang="ts">
	import {
		hydratePreferences,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import { channelGridState } from "$lib/channel/channel-grid-state.svelte";
	import { channelState } from "$lib/channel/channel-state.svelte";
	import { resolveGeohashForAccount } from "$lib/channel/location-helper";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { decodeGeohash } from "$lib/model/geohash";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import { revealedGridScrollTop } from "./grid-reveal";
	import Grid from "./Grid.svelte";
	import LocationChooser from "./LocationEmpty.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	const preferencesHydrated = hydratePreferences();
	const geohash = $derived(preferencesSnapshot().geohash);

	let gridContainer: HTMLElement | null = $state(null);

	const isGrindr = $derived(channelState.activeChannel === "grindr");
	const isRefreshing = $derived(
		isGrindr ? gridState.refreshing : channelGridState.loading,
	);
	const isLoading = $derived(
		isGrindr ? gridState.loading : channelGridState.loading,
	);
	const hasError = $derived(
		isGrindr ? Boolean(gridState.error) : Boolean(channelGridState.error),
	);

	function handleRefresh() {
		if (isGrindr) {
			void gridState.refresh({ keepLoadedPages: false });
		} else {
			const targetGeohash = resolveGeohashForAccount(
				channelState.currentAccount,
				geohash || "",
			);
			if (!targetGeohash) return;
			try {
				const { lat, lon } = decodeGeohash(targetGeohash);
				void channelGridState.load(
					lat,
					lon,
					undefined,
					targetGeohash,
					true,
				);
			} catch (e) {
				console.error("Refresh channel grid error:", e);
			}
		}
	}

	restoreScrollOnce({
		container: () => gridContainer,
		state: gridState,
		resolveTop: ({ scroller, savedTop }) => {
			const revealId = gridState.consumeReveal();
			if (revealId === null) return savedTop;
			return revealedGridScrollTop({
				scroller,
				savedTop,
				index: gridState.indexInProfiles(revealId),
			});
		},
	});

	$effect(() =>
		gridState.onStartOver(() => {
			if (gridContainer) gridContainer.scrollTop = 0;
		}),
	);
</script>

<svelte:head>
	<title>Open Grind</title>
</svelte:head>
{#await preferencesHydrated then}
	{#if geohash === null}
		<main class="m-auto flex max-w-full flex-1">
			<LocationChooser />
		</main>
	{:else}
		<main class="screen-nav-host">
			<TopBar />
			{#if !isLoading && !hasError}
				<DataRefreshControl
					container={gridContainer}
					updating={isRefreshing}
					position="top"
					onrefresh={handleRefresh}
				/>
			{/if}
			<div
				class="pull-scroller"
				bind:this={gridContainer}
				onscroll={() =>
					(gridState.scrollY = gridContainer?.scrollTop ?? 0)}
			>
				<div
					data-slot="grid-content"
					data-refresh-content
					class="@container/photo-grid min-h-overscrollable flex flex-col gap-4 px-4 pt-header-clear-17 pb-nav-clear"
				>
					<Grid {geohash} />
				</div>
			</div>
			<ScrollToTopButton
				container={gridContainer}
				class="bottom-nav-clear"
			/>
		</main>
	{/if}
{/await}

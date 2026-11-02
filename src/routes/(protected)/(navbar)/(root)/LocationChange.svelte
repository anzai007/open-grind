<script lang="ts">
	import ClockIcon from "phosphor-svelte/lib/ClockIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		preferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import {
		findLocationInfo,
		formatLocalTime,
		type LocationInfo,
	} from "$lib/components/location-chooser/cities";
	import { PIN_ZOOM } from "$lib/components/location-chooser/constants";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import { decodeGeohash } from "$lib/model/geohash";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	let pinPos: { lat: number; lon: number; zoom: number } | undefined =
		$state();
	let geoMapPickerOpen = $state(false);

	let currentTime = $state(new Date());

	$effect(() => {
		const timer = setInterval(() => {
			currentTime = new Date();
		}, 10_000);
		return () => clearInterval(timer);
	});

	async function onSubmit(submission: {
		geohash: string;
		autoUpdateLocation: boolean;
	}) {
		try {
			await setPreferences(submission);
			geoMapPickerOpen = false;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}

	function openPicker() {
		const geohash = preferencesSnapshot().geohash;
		pinPos = geohash
			? { ...decodeGeohash(geohash), zoom: PIN_ZOOM }
			: undefined;
		geoMapPickerOpen = true;
		if (pinPos) locationChooser.centerAt(pinPos);
	}

	let locationChooser: LocationChooser;

	const autoUpdateLocation = $derived(
		preferencesSnapshot().autoUpdateLocation,
	);
	const geohash = $derived(preferencesSnapshot().geohash);

	const locationInfo = $derived.by<LocationInfo | null>(() => {
		if (!geohash) return null;
		try {
			const { lat, lon } = decodeGeohash(geohash);
			return findLocationInfo(lat, lon);
		} catch {
			return null;
		}
	});

	const localTime = $derived.by(() => {
		if (!locationInfo) return "";
		return formatLocalTime(
			currentTime,
			locationInfo.timezone,
			locationInfo.lon,
		);
	});

	const tooltip = $derived(
		locationInfo
			? `${locationInfo.country} · ${locationInfo.city} | 当地时间: ${localTime} | 坐标: ${locationInfo.exactCoords} - 点击更换定位`
			: "点击设置定位",
	);
</script>

<div class="relative flex shrink-0">
	<Button
		variant="secondary"
		class={[
			"flex h-9 items-center gap-1.5 rounded-4xl px-2.5 transition-colors hover:bg-secondary/80",
			className,
		]}
		aria-label="Change location"
		title={tooltip}
		onclick={openPicker}
	>
		<div class="relative flex shrink-0 items-center justify-center">
			<MapPinIcon weight="fill" class="size-4 text-primary" />
			{#if autoUpdateLocation}
				<span
					data-slot="tracking-dot"
					class="pointer-events-none absolute -top-1 -right-1 size-1.5 rounded-full bg-destructive ring-1 ring-background"
				>
					<span class="sr-only"
						>Location is updating automatically</span
					>
				</span>
			{/if}
		</div>

		{#if locationInfo}
			<div
				class="flex min-w-0 flex-col items-start justify-center text-left leading-tight"
			>
				<div
					class="flex max-w-72 items-center gap-1.5 truncate text-xs font-semibold text-foreground"
				>
					{#if locationInfo.flag}
						<span class="text-xs leading-none"
							>{locationInfo.flag}</span
						>
					{/if}
					<span class="truncate"
						>{locationInfo.country} · {locationInfo.city}</span
					>
					{#if localTime}
						<span
							class="flex shrink-0 items-center gap-0.5 font-mono text-2xs font-normal text-muted-foreground"
							title={`当地时间: ${localTime}`}
						>
							<ClockIcon
								class="size-3 text-muted-foreground/80"
							/>
							<span>{localTime}</span>
						</span>
					{/if}
				</div>
				<div
					class="max-w-72 truncate font-mono text-3xs text-muted-foreground"
				>
					{locationInfo.coordsText}
				</div>
			</div>
		{:else}
			<span class="text-xs font-medium text-muted-foreground"
				>设置定位</span
			>
		{/if}
	</Button>
</div>
<LocationChooser
	{onSubmit}
	bind:open={geoMapPickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>

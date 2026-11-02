<script lang="ts">
	import BuildingsIcon from "phosphor-svelte/lib/BuildingsIcon";
	import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
	import GlobeIcon from "phosphor-svelte/lib/GlobeIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import { type City, COUNTRIES, type Country } from "./cities";

	let {
		onselect,
		disabled = false,
		class: className = "",
	}: {
		onselect: (target: {
			lat: number;
			lon: number;
			zoom?: number;
			isCity?: boolean;
		}) => void;
		disabled?: boolean;
		class?: string;
	} = $props();

	let selectedCountryCode = $state<string | null>(null);
	let selectedCityName = $state<string | null>(null);

	let countryOpen = $state(false);
	let cityOpen = $state(false);

	let countrySearch = $state("");
	let citySearch = $state("");

	let containerRef = $state<HTMLElement | null>(null);

	const selectedCountry = $derived(
		COUNTRIES.find((c) => c.code === selectedCountryCode) ?? null,
	);

	const availableCities = $derived(selectedCountry?.cities ?? []);

	const selectedCity = $derived(
		availableCities.find((c) => c.name === selectedCityName) ?? null,
	);

	const filteredCountries = $derived.by(() => {
		const q = countrySearch.trim().toLowerCase();
		if (!q) return COUNTRIES;
		return COUNTRIES.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				c.nameEn.toLowerCase().includes(q) ||
				c.code.toLowerCase().includes(q) ||
				c.aliases?.some((a) => a.toLowerCase().includes(q)),
		);
	});

	const filteredCities = $derived.by(() => {
		const q = citySearch.trim().toLowerCase();
		if (!q) return availableCities;
		return availableCities.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				(c.nameEn && c.nameEn.toLowerCase().includes(q)) ||
				c.aliases?.some((a) => a.toLowerCase().includes(q)),
		);
	});

	function focusOnMount(el: HTMLElement) {
		el.focus();
	}

	function handleSelectCountry(country: Country) {
		selectedCountryCode = country.code;
		selectedCityName = null;
		countryOpen = false;
		countrySearch = "";

		// 平移地图中心至所选国家
		onselect({
			lat: country.center.lat,
			lon: country.center.lon,
			zoom: country.center.zoom,
			isCity: false,
		});

		// 联动自动展开二级城市下拉菜单
		cityOpen = true;
	}

	function handleSelectCity(city: City) {
		selectedCityName = city.name;
		cityOpen = false;
		citySearch = "";

		// 定位并将图钉移动至所选城市核心位置
		onselect({
			lat: city.lat,
			lon: city.lon,
			zoom: city.zoom ?? 12,
			isCity: true,
		});
	}

	function handleReset(e: MouseEvent) {
		e.stopPropagation();
		selectedCountryCode = null;
		selectedCityName = null;
		countryOpen = false;
		cityOpen = false;
		countrySearch = "";
		citySearch = "";
	}

	$effect(() => {
		if (!countryOpen && !cityOpen) return;
		const onDocClick = (e: MouseEvent) => {
			if (containerRef && !containerRef.contains(e.target as Node)) {
				countryOpen = false;
				cityOpen = false;
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				countryOpen = false;
				cityOpen = false;
			}
		};
		document.addEventListener("mousedown", onDocClick);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onDocClick);
			document.removeEventListener("keydown", onKeyDown);
		};
	});
</script>

<div
	bind:this={containerRef}
	class={[
		"flex items-center gap-1.5 rounded-2xl border border-border/70 bg-popover/90 p-1 text-popover-foreground shadow-lg backdrop-blur-md transition-opacity select-none dark:bg-card/90",
		{ "pointer-events-none opacity-50": disabled },
		className,
	]}
>
	<!-- 一级：国家下拉框 -->
	<div class="relative min-w-0 flex-1">
		<button
			type="button"
			class={[
				"flex h-8.5 w-full cursor-pointer items-center justify-between gap-1 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-accent/80 active:scale-[0.98]",
				{
					"bg-accent/40 font-semibold text-foreground":
						Boolean(selectedCountry),
					"text-muted-foreground": !selectedCountry,
				},
			]}
			onclick={() => {
				cityOpen = false;
				countryOpen = !countryOpen;
			}}
		>
			<span class="flex min-w-0 items-center gap-1.5 truncate">
				{#if selectedCountry}
					<span class="shrink-0 text-sm">{selectedCountry.flag}</span>
					<span class="truncate">{selectedCountry.name}</span>
				{:else}
					<GlobeIcon class="size-4 shrink-0 text-muted-foreground" />
					<span class="truncate">选择国家</span>
				{/if}
			</span>
			<CaretDownIcon
				class={[
					"size-3.5 shrink-0 opacity-60 transition-transform duration-200",
					{ "rotate-180": countryOpen },
				]}
			/>
		</button>

		{#if countryOpen}
			<div
				class="absolute top-full left-0 z-1050 mt-1.5 flex max-h-72 w-56 animate-in flex-col rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-black/10 duration-150 zoom-in-95 fade-in"
			>
				<!-- 搜索框 -->
				<div class="relative mb-1 px-1">
					<MagnifyingGlassIcon
						class="absolute top-2 left-2.5 size-3.5 text-muted-foreground"
					/>
					<input
						type="search"
						bind:value={countrySearch}
						placeholder="搜索国家 (如: 中国 / US)..."
						class="h-7 w-full rounded-lg bg-input/40 py-1 pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-ring"
						use:focusOnMount
					/>
				</div>

				<!-- 国家列表 -->
				<div
					class="max-h-56 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-0.5"
				>
					{#each filteredCountries as country (country.code)}
						<button
							type="button"
							class={[
								"flex h-8 w-full cursor-pointer items-center justify-between rounded-lg px-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
								{
									"bg-accent/70 font-semibold text-accent-foreground":
										selectedCountryCode === country.code,
								},
							]}
							onclick={() => handleSelectCountry(country)}
						>
							<span class="flex items-center gap-2 truncate">
								<span class="shrink-0 text-sm"
									>{country.flag}</span
								>
								<span class="truncate">{country.name}</span>
								<span
									class="truncate text-[10px] text-muted-foreground"
								>
									{country.nameEn}
								</span>
							</span>
							{#if selectedCountryCode === country.code}
								<span class="text-xs font-bold text-primary"
									>✓</span
								>
							{/if}
						</button>
					{:else}
						<div
							class="py-4 text-center text-xs text-muted-foreground"
						>
							未找到对应国家
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="h-4 w-px shrink-0 bg-border/60"></div>

	<!-- 二级：核心城市下拉框 -->
	<div class="relative min-w-0 flex-1">
		<button
			type="button"
			disabled={!selectedCountry}
			class={[
				"flex h-8.5 w-full items-center justify-between gap-1 rounded-xl px-2.5 text-xs font-medium transition-colors",
				{
					"cursor-not-allowed text-muted-foreground opacity-50":
						!selectedCountry,
					"cursor-pointer bg-accent/40 font-semibold text-foreground hover:bg-accent/80 active:scale-[0.98]":
						Boolean(selectedCountry && selectedCity),
					"cursor-pointer text-muted-foreground hover:bg-accent/80 active:scale-[0.98]":
						Boolean(selectedCountry && !selectedCity),
				},
			]}
			onclick={() => {
				if (!selectedCountry) return;
				countryOpen = false;
				cityOpen = !cityOpen;
			}}
		>
			<span class="flex min-w-0 items-center gap-1.5 truncate">
				<BuildingsIcon class="size-4 shrink-0 text-muted-foreground" />
				{#if selectedCity}
					<span class="truncate font-semibold text-primary"
						>{selectedCity.name}</span
					>
				{:else if selectedCountry}
					<span class="truncate">选择核心城市</span>
				{:else}
					<span class="truncate text-muted-foreground/60"
						>请先选国家</span
					>
				{/if}
			</span>
			<CaretDownIcon
				class={[
					"size-3.5 shrink-0 opacity-60 transition-transform duration-200",
					{ "rotate-180": cityOpen },
				]}
			/>
		</button>

		{#if cityOpen && selectedCountry}
			<div
				class="absolute top-full right-0 z-1050 mt-1.5 flex max-h-72 w-56 animate-in flex-col rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-black/10 duration-150 zoom-in-95 fade-in sm:right-auto sm:left-0"
			>
				<!-- 搜索框 -->
				<div class="relative mb-1 px-1">
					<MagnifyingGlassIcon
						class="absolute top-2 left-2.5 size-3.5 text-muted-foreground"
					/>
					<input
						type="search"
						bind:value={citySearch}
						placeholder={`搜索 ${selectedCountry.name} 城市...`}
						class="h-7 w-full rounded-lg bg-input/40 py-1 pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-ring"
						use:focusOnMount
					/>
				</div>

				<!-- 城市列表 -->
				<div
					class="max-h-56 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-0.5"
				>
					{#each filteredCities as city (city.name)}
						<button
							type="button"
							class={[
								"flex h-8 w-full cursor-pointer items-center justify-between rounded-lg px-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
								{
									"bg-accent/70 font-semibold text-accent-foreground":
										selectedCityName === city.name,
								},
							]}
							onclick={() => handleSelectCity(city)}
						>
							<span class="flex items-center gap-1.5 truncate">
								<span class="truncate">{city.name}</span>
								{#if city.nameEn}
									<span
										class="truncate text-[10px] text-muted-foreground"
									>
										{city.nameEn}
									</span>
								{/if}
							</span>
							{#if selectedCityName === city.name}
								<span class="text-xs font-bold text-primary"
									>✓</span
								>
							{/if}
						</button>
					{:else}
						<div
							class="py-4 text-center text-xs text-muted-foreground"
						>
							未找到对应城市
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- 重置按钮 -->
	{#if selectedCountryCode}
		<button
			type="button"
			class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
			onclick={handleReset}
			title="重置位置选择"
			aria-label="重置位置选择"
		>
			<XIcon class="size-3.5" />
		</button>
	{/if}
</div>

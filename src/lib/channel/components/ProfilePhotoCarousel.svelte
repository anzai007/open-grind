<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import ArrowRightIcon from "phosphor-svelte/lib/ArrowRightIcon";

	import { Button } from "$lib/components/ui/button";
	import type { UniversalPhoto } from "../types";

	let {
		photos,
		displayName,
	}: { photos: UniversalPhoto[]; displayName: string } = $props();

	let activePhotoIndex = $state(0);

	const currentPhoto = $derived(photos[activePhotoIndex]);
</script>

<div class="relative aspect-4/5 w-full overflow-hidden bg-muted/50">
	{#if currentPhoto?.fullsizeUrl || currentPhoto?.thumbnailUrl}
		<img
			src={currentPhoto.fullsizeUrl || currentPhoto.thumbnailUrl}
			alt={displayName}
			class="h-full w-full object-cover"
		/>
	{:else}
		<div
			class="flex h-full w-full items-center justify-center text-4xl font-bold text-muted-foreground"
		>
			{displayName.slice(0, 1)}
		</div>
	{/if}

	{#if photos.length > 1}
		<div
			class="absolute inset-x-0 bottom-3 flex items-center justify-between px-3"
		>
			<Button
				variant="secondary"
				size="icon"
				disabled={activePhotoIndex === 0}
				onclick={() =>
					(activePhotoIndex = Math.max(0, activePhotoIndex - 1))}
				class="size-8 rounded-full bg-black/50 text-white backdrop-blur-xs hover:bg-black/70 disabled:opacity-30"
			>
				<ArrowLeftIcon class="size-4" />
			</Button>

			<span
				class="rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-xs"
			>
				{activePhotoIndex + 1} / {photos.length}
			</span>

			<Button
				variant="secondary"
				size="icon"
				disabled={activePhotoIndex === photos.length - 1}
				onclick={() =>
					(activePhotoIndex = Math.min(
						photos.length - 1,
						activePhotoIndex + 1,
					))}
				class="size-8 rounded-full bg-black/50 text-white backdrop-blur-xs hover:bg-black/70 disabled:opacity-30"
			>
				<ArrowRightIcon class="size-4" />
			</Button>
		</div>
	{/if}
</div>

{#if photos.length > 1}
	<div
		class="scrollbar-none flex gap-1.5 overflow-x-auto border-b border-border/40 p-3"
	>
		{#each photos as p, idx (p.id || p.thumbnailUrl || idx)}
			<button
				type="button"
				onclick={() => (activePhotoIndex = idx)}
				class={[
					"relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
					{
						"border-primary ring-2 ring-primary/30":
							activePhotoIndex === idx,
						"border-transparent opacity-60 hover:opacity-100":
							activePhotoIndex !== idx,
					},
				]}
			>
				<img
					src={p.thumbnailUrl || p.fullsizeUrl}
					alt=""
					class="h-full w-full object-cover"
				/>
			</button>
		{/each}
	</div>
{/if}

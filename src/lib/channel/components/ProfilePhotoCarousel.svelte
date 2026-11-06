<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import ArrowRightIcon from "phosphor-svelte/lib/ArrowRightIcon";

	import { Button } from "$lib/components/ui/button";
	import { resolveSubImageDataUrl } from "../sub-protocol/sub-image-resolver";
	import type { UniversalPhoto } from "../types";

	let {
		photos,
		displayName,
	}: { photos: UniversalPhoto[]; displayName: string } = $props();

	let activePhotoIndex = $state(0);

	const currentPhoto = $derived(photos[activePhotoIndex]);

	const effectiveCurrentSrc = $derived(
		(currentPhoto?.fullsizeUrl?.startsWith("data:")
			? currentPhoto.fullsizeUrl
			: null) ||
			(currentPhoto?.thumbnailUrl?.startsWith("data:")
				? currentPhoto.thumbnailUrl
				: null) ||
			currentPhoto?.fullsizeUrl ||
			currentPhoto?.thumbnailUrl ||
			"",
	);

	let startX = 0;
	let startY = 0;
	let isDragging = false;

	let accumulatedDeltaX = 0;
	let isWheelLocked = false;
	let wheelResetTimer: ReturnType<typeof setTimeout> | null = null;

	function handlePointerDown(e: PointerEvent) {
		if (photos.length <= 1) return;
		startX = e.clientX;
		startY = e.clientY;
		isDragging = true;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// ignore
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		const diffX = e.clientX - startX;
		const diffY = Math.abs(e.clientY - startY);

		// 水平拖动距离大于 40px 且大于垂直位移，触发切图
		if (Math.abs(diffX) > 40 && Math.abs(diffX) > diffY) {
			if (diffX < 0) {
				activePhotoIndex = Math.min(
					photos.length - 1,
					activePhotoIndex + 1,
				);
			} else {
				activePhotoIndex = Math.max(0, activePhotoIndex - 1);
			}
		}
	}

	function handlePointerCancel() {
		isDragging = false;
	}

	function handleWheel(e: WheelEvent) {
		if (photos.length <= 1) return;

		const absX = Math.abs(e.deltaX);
		const absY = Math.abs(e.deltaY);

		// 判断是否属于 macOS 触控板双指横向滑动（或 Shift + 滚轮）
		const isHorizontalSwipe = absX > absY || (e.shiftKey && absY > 0);
		if (!isHorizontalSwipe) return;

		// 阻止 macOS 原生滑动前进/后退或页面横向滚动
		e.preventDefault();
		e.stopPropagation();

		const delta = e.shiftKey && absY > absX ? e.deltaY : e.deltaX;

		// 刷新惯性滑动结束重置计时器
		if (wheelResetTimer) {
			clearTimeout(wheelResetTimer);
		}
		wheelResetTimer = setTimeout(() => {
			accumulatedDeltaX = 0;
			isWheelLocked = false;
		}, 180);

		if (isWheelLocked) {
			return;
		}

		accumulatedDeltaX += delta;

		// 滑动阈值：触控板位移达到 35px 即触发切图
		const SWIPE_THRESHOLD = 35;
		if (Math.abs(accumulatedDeltaX) >= SWIPE_THRESHOLD) {
			if (accumulatedDeltaX > 0) {
				// 双指左滑（向右滚动） -> 切换下一张图片
				activePhotoIndex = Math.min(
					photos.length - 1,
					activePhotoIndex + 1,
				);
			} else {
				// 双指右滑（向左滚动） -> 切换上一张图片
				activePhotoIndex = Math.max(0, activePhotoIndex - 1);
			}
			accumulatedDeltaX = 0;
			isWheelLocked = true;
		}
	}

	function wheelSwipe(node: HTMLElement) {
		node.addEventListener("wheel", handleWheel, { passive: false });
		return {
			destroy() {
				node.removeEventListener("wheel", handleWheel);
				if (wheelResetTimer) {
					clearTimeout(wheelResetTimer);
				}
			},
		};
	}
</script>

<div
	use:wheelSwipe
	role="region"
	aria-label="相册图片预览"
	class={[
		"relative aspect-4/5 w-full touch-pan-y overflow-hidden bg-muted/50 select-none",
		{ "cursor-grab active:cursor-grabbing": photos.length > 1 },
	]}
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerCancel}
>
	{#if effectiveCurrentSrc}
		<img
			src={effectiveCurrentSrc}
			alt={displayName}
			draggable="false"
			class="pointer-events-none h-full w-full object-cover"
			referrerpolicy="no-referrer"
			onerror={async (e) => {
				const target = e.currentTarget as HTMLImageElement;
				const candidate =
					currentPhoto?.fullsizeUrl || currentPhoto?.thumbnailUrl;
				if (
					candidate &&
					candidate.startsWith("https://images.sublifeapp.com/")
				) {
					const dataUrl = await resolveSubImageDataUrl(candidate);
					if (dataUrl && dataUrl !== target.src) {
						target.src = dataUrl;
					}
				}
			}}
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
				onclick={(e) => {
					e.stopPropagation();
					activePhotoIndex = Math.max(0, activePhotoIndex - 1);
				}}
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
				onclick={(e) => {
					e.stopPropagation();
					activePhotoIndex = Math.min(
						photos.length - 1,
						activePhotoIndex + 1,
					);
				}}
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
					src={(p.thumbnailUrl?.startsWith("data:")
						? p.thumbnailUrl
						: null) ||
						(p.fullsizeUrl?.startsWith("data:")
							? p.fullsizeUrl
							: null) ||
						p.thumbnailUrl ||
						p.fullsizeUrl}
					alt=""
					draggable="false"
					class="h-full w-full object-cover"
					referrerpolicy="no-referrer"
					onerror={async (e) => {
						const target = e.currentTarget as HTMLImageElement;
						const candidate = p.thumbnailUrl || p.fullsizeUrl;
						if (
							candidate &&
							candidate.startsWith(
								"https://images.sublifeapp.com/",
							)
						) {
							const dataUrl =
								await resolveSubImageDataUrl(candidate);
							if (dataUrl && dataUrl !== target.src) {
								target.src = dataUrl;
							}
						}
					}}
				/>
			</button>
		{/each}
	</div>
{/if}

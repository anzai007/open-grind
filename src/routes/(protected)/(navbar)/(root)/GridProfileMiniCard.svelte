<script lang="ts">
	import { goto } from "$app/navigation";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import { templateState } from "$lib/channel/template-state.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { isPlainClick } from "$lib/util/plain-click";

	let {
		id,
		displayName = null,
		age = null,
		distance = null,
		medias = null,
		unread = null,
		onlineUntil = null,
		isFavorite = false,
		isVisiting = false,
		hadRecentChat = false,
	}: {
		id: number;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		medias?: { mediaHash: string }[] | null;
		unread?: number | null;
		onlineUntil?: number | null;
		isFavorite?: boolean;
		isVisiting?: boolean;
		hadRecentChat?: boolean;
	} = $props();

	function openInPager(event: MouseEvent) {
		if (!isPlainClick(event)) return;
		event.preventDefault();
		void goto(`/profile/${id}`, { state: { profileOrigin: "browse" } });
	}
</script>

<ProfileMiniCard
	mediaHash={medias?.[0]?.mediaHash ?? null}
	{displayName}
	{age}
	{distance}
	{unread}
	{onlineUntil}
	{isFavorite}
	{isVisiting}
	{hadRecentChat}
	href="/profile/{id}"
	onclick={openInPager}
>
	{#snippet overlay()}
		<!-- 快捷私信按钮：随机从激活模版组选择并发送 -->
		<button
			type="button"
			class="absolute right-1.5 bottom-1.5 z-10 flex size-6.5 cursor-pointer items-center justify-center rounded-full bg-primary/95 text-primary-foreground shadow-md transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
			title="快捷私信"
			disabled={templateState.sendingUserIds.has(String(id))}
			onclick={(e) => {
				e.stopPropagation();
				e.preventDefault();
				void templateState.sendQuickDm({
					id: String(id),
					displayName: displayName || `User ${id}`,
				});
			}}
		>
			{#if templateState.sendingUserIds.has(String(id))}
				<Spinner class="size-3" />
			{:else}
				<PaperPlaneRightIcon class="size-3" weight="fill" />
			{/if}
		</button>
	{/snippet}
</ProfileMiniCard>

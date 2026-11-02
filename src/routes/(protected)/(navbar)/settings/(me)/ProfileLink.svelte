<script lang="ts">
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";

	import { getProfile } from "$lib/api/users/profiles";
	import { channelState } from "$lib/channel/channel-state.svelte";
	import BrokenUserAvatar from "$lib/components/profile/BrokenUserAvatar.svelte";
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Item from "$lib/components/ui/item";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let { id }: { id: number } = $props();

	const myProfile = $derived(getProfile(id));
	const myProfilePhotos = $derived(
		myProfile.then((profile) => profile.medias),
	);
	const currentAccount = $derived(channelState.currentAccount);
	const currentMeta = $derived(channelState.currentMeta);

	function handleClickChannelProfile() {
		const metaId = currentAccount?.extraMeta?.profileId;
		if (typeof metaId === "string" || typeof metaId === "number") {
			void channelState.openProfile(String(metaId));
		} else {
			channelState.openAccountDialog(channelState.activeChannel);
		}
	}
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		{#if channelState.activeChannel === "grindr"}
			<a
				href="/profile/{id}"
				{...props}
				class={["rounded-full", props.class, "flex-nowrap!"]}
			>
				<Item.Media
					class="translate-y-none size-14 rounded-full bg-neutral-700"
				>
					{#await myProfilePhotos then photos}
						<UserAvatar
							mediaHash={photos[0]?.mediaHash ?? null}
							class="size-full *:rounded-full"
							size="lg"
						/>
					{:catch}
						<BrokenUserAvatar />
					{/await}
				</Item.Media>
				<Item.Content class="min-w-0">
					<Item.Title
						class="inline-block w-full min-w-0 truncate text-left"
					>
						{#await myProfile}
							<Skeleton class="my-0.5 h-3.75 w-32" />
						{:then profile}
							<DisplayName name={profile.displayName} />
						{:catch}
							<span class="text-muted-foreground italic">
								Failed to load name
							</span>
						{/await}
					</Item.Title>
					<Item.Description class="inline-block truncate">
						View your profile
					</Item.Description>
				</Item.Content>
				<Item.Actions class="max-cramped:hidden">
					<CaretRightIcon class="size-4" />
				</Item.Actions>
			</a>
		{:else}
			<button
				type="button"
				onclick={handleClickChannelProfile}
				{...props}
				class={[
					"w-full rounded-full text-left",
					props.class,
					"flex-nowrap!",
				]}
			>
				<Item.Media
					class="translate-y-none relative size-14 shrink-0 overflow-hidden rounded-full border border-border"
				>
					{#if currentAccount?.avatarUrl}
						<img
							src={currentAccount.avatarUrl}
							alt={currentAccount.name}
							class="size-full rounded-full object-cover"
						/>
					{:else if currentAccount}
						<div
							class="flex size-full items-center justify-center rounded-full text-sm font-bold text-white shadow-xs"
							style:background-color={currentMeta.brandColor}
						>
							{currentAccount.name.slice(0, 2).toUpperCase()}
						</div>
					{:else}
						<div
							class="flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground"
						>
							<UserIcon class="size-6" />
						</div>
					{/if}
				</Item.Media>
				<Item.Content class="min-w-0">
					<div class="flex items-center gap-1.5">
						<Item.Title
							class="inline-block max-w-[70%] truncate text-left font-semibold"
						>
							{currentAccount?.name ||
								`未配置 ${currentMeta.name} 账号`}
						</Item.Title>
						<Badge
							class="h-4 px-1.5 text-2xs font-semibold text-white"
							style="background-color: {currentMeta.brandColor}"
						>
							{currentMeta.name}
						</Badge>
					</div>
					<Item.Description
						class="inline-block w-full truncate text-xs text-muted-foreground"
					>
						{#if currentAccount}
							{currentAccount.accountIdentifier}{currentAccount.lastLocationName
								? ` · 📍 ${currentAccount.lastLocationName}`
								: ""}
						{:else}
							点击配置并激活设备
						{/if}
					</Item.Description>
				</Item.Content>
				<Item.Actions class="max-cramped:hidden">
					<CaretRightIcon class="size-4" />
				</Item.Actions>
			</button>
		{/if}
	{/snippet}
</Item.Root>

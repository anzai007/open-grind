<script lang="ts">
	import ListIcon from "phosphor-svelte/lib/ListIcon";
	import PulseIcon from "phosphor-svelte/lib/PulseIcon";
	import UsersThreeIcon from "phosphor-svelte/lib/UsersThreeIcon";
	import { onMount } from "svelte";
	import { tinykeys } from "tinykeys";

	import { channelState } from "$lib/channel/channel-state.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { networkLoggerState } from "./network-logger-state.svelte";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	onMount(() => {
		return tinykeys(window, {
			"$mod+Shift+L": (event) => {
				event.preventDefault();
				networkLoggerState.open = !networkLoggerState.open;
			},
		});
	});

	const totalCount = $derived(
		networkLoggerState.httpLogs.length + networkLoggerState.wsLogs.length,
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="secondary"
				size="icon"
				class={[
					"relative size-9 shrink-0 rounded-4xl transition-colors hover:bg-secondary/80",
					className,
				]}
				aria-label="功能菜单"
				title="功能菜单 (快捷键 ⌘⇧L 查看请求日志)"
			>
				<ListIcon class="size-4.5" />
				{#if totalCount > 0}
					<span
						class="pointer-events-none absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary"
					></span>
				{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-56 p-1.5 shadow-xl">
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading
				class="px-2 py-1 text-xs font-medium text-muted-foreground"
			>
				多渠道管理
			</DropdownMenu.GroupHeading>
			<DropdownMenu.Item
				onSelect={() => channelState.openAccountDialog()}
				class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-accent"
			>
				<div class="flex items-center gap-2">
					<UsersThreeIcon class="size-4 text-primary" weight="bold" />
					<span class="text-sm font-medium">渠道与账号管理</span>
				</div>
				<Badge
					variant="outline"
					class="h-4.5 px-1.5 font-mono text-[10px] capitalize"
				>
					{channelState.activeChannel}
				</Badge>
			</DropdownMenu.Item>
		</DropdownMenu.Group>

		<DropdownMenu.Separator class="my-1" />

		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading
				class="px-2 py-1 text-xs font-medium text-muted-foreground"
			>
				开发者与工具
			</DropdownMenu.GroupHeading>
			<DropdownMenu.Item
				onSelect={() => (networkLoggerState.open = true)}
				class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-accent"
			>
				<div class="flex items-center gap-2">
					<PulseIcon class="size-4 text-primary" weight="bold" />
					<span class="text-sm font-medium">查看请求日志</span>
				</div>
				<div class="flex items-center gap-1.5">
					{#if totalCount > 0}
						<Badge
							variant="secondary"
							class="h-4.5 px-1.5 text-[10px]"
						>
							{totalCount}
						</Badge>
					{/if}
					<span class="font-mono text-[10px] text-muted-foreground"
						>⌘⇧L</span
					>
				</div>
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>

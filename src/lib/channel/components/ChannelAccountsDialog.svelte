<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import GearSixIcon from "phosphor-svelte/lib/GearSixIcon";
	import UserCircleIcon from "phosphor-svelte/lib/UserCircleIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Tabs from "$lib/components/ui/tabs";
	import { channelState } from "../channel-state.svelte";
	import type { SocialChannelType } from "../types";
	import AddAccountForm from "./AddAccountForm.svelte";
	import ChannelAccountList from "./ChannelAccountList.svelte";
	import RelaySettingsTab from "./RelaySettingsTab.svelte";

	let activeTab = $state<string>("scruff");

	$effect(() => {
		if (channelState.isAccountDialogOpen) {
			activeTab = channelState.dialogChannel;
		}
	});

	function handleSwitchActiveChannel(ch: SocialChannelType) {
		channelState.switchChannel(ch);
	}
</script>

<Dialog.Root bind:open={channelState.isAccountDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs"
		/>
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background p-0 shadow-2xl"
		>
			<Dialog.Header
				class="flex flex-row items-center justify-between border-b border-border/60 px-5 py-3.5"
			>
				<div class="flex items-center gap-2">
					<UserCircleIcon class="size-5 text-primary" weight="bold" />
					<Dialog.Title class="text-base font-semibold">
						渠道与账号管理 (Channels & Accounts)
					</Dialog.Title>
				</div>

				<Dialog.Close>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class="size-7 rounded-full text-muted-foreground hover:text-foreground"
							aria-label="关闭"
						>
							<XIcon class="size-4" />
						</Button>
					{/snippet}
				</Dialog.Close>
			</Dialog.Header>

			<Tabs.Root
				bind:value={activeTab}
				class="flex flex-1 flex-col overflow-hidden"
			>
				<div class="border-b border-border/60 bg-muted/20 px-5 pt-2">
					<Tabs.List class="grid h-9 w-full grid-cols-4">
						<Tabs.Trigger
							value="grindr"
							class="text-xs data-[state=active]:font-semibold"
						>
							<span
								class="mr-1.5 inline-block size-2 rounded-full bg-[#ffc700]"
							></span>
							Grindr
						</Tabs.Trigger>
						<Tabs.Trigger
							value="scruff"
							class="text-xs data-[state=active]:font-semibold"
						>
							<span
								class="mr-1.5 inline-block size-2 rounded-full bg-[#2da44e]"
							></span>
							Scruff
						</Tabs.Trigger>
						<Tabs.Trigger
							value="jackd"
							class="text-xs data-[state=active]:font-semibold"
						>
							<span
								class="mr-1.5 inline-block size-2 rounded-full bg-[#ff6600]"
							></span>
							Jack'd
						</Tabs.Trigger>
						<Tabs.Trigger
							value="relay"
							class="text-xs data-[state=active]:font-semibold"
						>
							<GearSixIcon class="mr-1 size-3.5" />
							中继网关
						</Tabs.Trigger>
					</Tabs.List>
				</div>

				<div class="flex-1 overflow-y-auto px-5 py-4">
					<Tabs.Content
						value="grindr"
						class="mt-0 flex flex-col gap-4"
					>
						<div
							class="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-4"
						>
							<div class="flex items-center gap-3">
								<div
									class="flex size-11 items-center justify-center rounded-xl bg-[#ffc700] text-sm font-bold text-black shadow-sm"
								>
									G
								</div>
								<div class="flex flex-col">
									<div class="flex items-center gap-2">
										<span class="text-sm font-semibold">
											Grindr 官方会话通道
										</span>
										{#if channelState.activeChannel === "grindr"}
											<Badge
												variant="default"
												class="h-4.5 px-1.5 text-[10px]"
											>
												当前激活渠道
											</Badge>
										{/if}
									</div>
									<span class="text-xs text-muted-foreground">
										Grindr 使用原生 Token
										鉴权体系，与官方移动端完全互通。
									</span>
								</div>
							</div>

							{#if channelState.activeChannel !== "grindr"}
								<Button
									size="sm"
									variant="outline"
									onclick={() =>
										handleSwitchActiveChannel("grindr")}
									class="h-8 gap-1.5 text-xs"
								>
									<CheckCircleIcon
										class="size-3.5 text-primary"
									/>
									<span>切换为主渠道</span>
								</Button>
							{/if}
						</div>
					</Tabs.Content>

					<Tabs.Content
						value="scruff"
						class="mt-0 flex flex-col gap-4"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-sm font-semibold"
									>Scruff 账号池</span
								>
								{#if channelState.activeChannel === "scruff"}
									<Badge
										variant="default"
										class="h-4.5 bg-[#2da44e] px-1.5 text-[10px] text-white"
									>
										当前激活渠道
									</Badge>
								{/if}
							</div>
							{#if channelState.activeChannel !== "scruff"}
								<Button
									size="sm"
									variant="outline"
									onclick={() =>
										handleSwitchActiveChannel("scruff")}
									class="h-7 gap-1 px-2.5 text-xs"
								>
									<span>切换为 Scruff 渠道</span>
								</Button>
							{/if}
						</div>

						<ChannelAccountList channel="scruff" />
						<AddAccountForm channel="scruff" />
					</Tabs.Content>

					<Tabs.Content
						value="jackd"
						class="mt-0 flex flex-col gap-4"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-sm font-semibold"
									>Jack'd 账号池</span
								>
								{#if channelState.activeChannel === "jackd"}
									<Badge
										variant="default"
										class="h-4.5 bg-[#ff6600] px-1.5 text-[10px] text-white"
									>
										当前激活渠道
									</Badge>
								{/if}
							</div>
							{#if channelState.activeChannel !== "jackd"}
								<Button
									size="sm"
									variant="outline"
									onclick={() =>
										handleSwitchActiveChannel("jackd")}
									class="h-7 gap-1 px-2.5 text-xs"
								>
									<span>切换为 Jack'd 渠道</span>
								</Button>
							{/if}
						</div>

						<ChannelAccountList channel="jackd" />
						<AddAccountForm channel="jackd" />
					</Tabs.Content>

					<Tabs.Content value="relay" class="mt-0">
						<RelaySettingsTab />
					</Tabs.Content>
				</div>
			</Tabs.Root>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

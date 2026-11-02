<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import GlobeIcon from "phosphor-svelte/lib/GlobeIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import { toast } from "svelte-sonner";

	import * as Avatar from "$lib/components/ui/avatar";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { channelState } from "../channel-state.svelte";
	import { maskProxyUrl } from "../scruff-protocol/proxy-helper";
	import type { ChannelAccount, SocialChannelType } from "../types";

	let { channel }: { channel: SocialChannelType } = $props();

	let verifyingId = $state<string | null>(null);

	const accounts = $derived(channelState.accounts[channel] || []);
	const activeAccountId = $derived(channelState.activeAccountIds[channel]);

	async function handleVerify(acc: ChannelAccount) {
		verifyingId = acc.id;
		try {
			const res = await channelState.verifyAndSaveAccount(channel, acc);
			if (res.valid) {
				toast.success(`账号验证成功: ${res.displayName || acc.name}`);
			} else {
				toast.error(`验证未通过: ${res.errorMessage || "未能连接"}`);
			}
		} catch (e) {
			toast.error(
				`验证异常: ${e instanceof Error ? e.message : String(e)}`,
			);
		} finally {
			verifyingId = null;
		}
	}

	function handleSetCurrent(acc: ChannelAccount) {
		channelState.setActiveAccount(channel, acc.id);
		toast.info(`已切换当前 ${channel.toUpperCase()} 账号为: ${acc.name}`);
	}

	function handleDelete(acc: ChannelAccount) {
		channelState.removeAccount(channel, acc.id);
		toast.success(`已移除账号: ${acc.name}`);
	}
</script>

<div class="flex flex-col gap-2">
	{#if accounts.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 py-8 text-center text-muted-foreground"
		>
			<UserIcon class="size-8 opacity-40" />
			<p class="mt-2 text-xs">
				暂无已配置的 {channel.toUpperCase()} 账号
			</p>
			<p class="text-[11px] opacity-70">
				请在下方输入账号邮箱添加并自动激活设备
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each accounts as acc (acc.id)}
				{@const isActive = acc.id === activeAccountId}
				{@const isVerifying = acc.id === verifyingId}
				<div
					class={[
						"flex flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
						{
							"border-primary/50 bg-primary/5": isActive,
							"border-border/60 bg-card hover:border-border":
								!isActive,
						},
					]}
				>
					<div class="flex min-w-0 items-center gap-3">
						<Avatar.Root
							class="size-10 shrink-0 border border-border"
						>
							{#if acc.avatarUrl}
								<Avatar.Image
									src={acc.avatarUrl}
									alt={acc.name}
								/>
							{/if}
							<Avatar.Fallback
								class="bg-muted text-xs font-semibold"
							>
								{acc.name.slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>

						<div class="flex min-w-0 flex-col">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-medium">
									{acc.name}
								</span>
								{#if isActive}
									<Badge
										variant="default"
										class="h-4.5 px-1.5 text-[10px]"
									>
										当前使用
									</Badge>
								{/if}
							</div>
							<span
								class="truncate font-mono text-xs text-muted-foreground"
							>
								{acc.accountIdentifier}
							</span>
							{#if acc.lastLocationName}
								<div
									class="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium text-muted-foreground/90"
								>
									<span>📍 {acc.lastLocationName}</span>
								</div>
							{/if}
							{#if acc.proxyUrl}
								<div
									class="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground/80"
								>
									<GlobeIcon
										class="size-3 shrink-0 text-emerald-500"
									/>
									<span class="truncate"
										>{maskProxyUrl(acc.proxyUrl)}</span
									>
									{#if acc.proxyUrl.includes("@")}
										<span
											class="font-sans text-[9px] text-emerald-500"
											>[专属隧道]</span
										>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<div
						class="flex shrink-0 items-center gap-1.5 self-end sm:self-center"
					>
						{#if !isActive}
							<Button
								variant="outline"
								size="sm"
								onclick={() => handleSetCurrent(acc)}
								class="h-7 gap-1 px-2 text-xs"
							>
								<CheckIcon class="size-3.5" />
								<span>使用</span>
							</Button>
						{/if}

						<Button
							variant="ghost"
							size="sm"
							disabled={isVerifying}
							onclick={() => handleVerify(acc)}
							title="重新验证有效性与激活设备"
							class="h-7 w-7 p-0"
						>
							{#if isVerifying}
								<Spinner class="size-3.5" />
							{:else}
								<ArrowsClockwiseIcon
									class="size-3.5 text-muted-foreground"
								/>
							{/if}
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onclick={() => handleDelete(acc)}
							title="删除此账号"
							class="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
						>
							<TrashIcon class="size-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

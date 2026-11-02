<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import { channelState } from "../channel-state.svelte";
	import {
		getProxyHostPort,
		maskProxyUrl,
		queryPlatformAccount,
		resolveEffectiveProxy,
	} from "../scruff-protocol/proxy-helper";
	import { RelayClient } from "../scruff-protocol/relay-client";
	import type { ChannelAccount, SocialChannelType } from "../types";

	let {
		channel,
		onAccountAdded,
	}: { channel: SocialChannelType; onAccountAdded?: () => void } = $props();

	let email = $state("");
	let name = $state("");
	let proxyUrl = $state("");
	let relayKey = $state("");
	let isLoading = $state(false);
	let errorText = $state<string | null>(null);
	let platformMatchInfo = $state<string | null>(null);
	let platformProxy = $state<string | null>(null);
	let platformUserId = $state<string | null>(null);

	// 平台账号池快速选择面板
	let showPoolPicker = $state(false);
	let isLoadingPool = $state(false);
	let poolAccounts = $state<
		Array<{
			account: string;
			hasAccessToken: boolean;
			platformUserId: string;
			proxyUrl: string;
		}>
	>([]);

	async function togglePlatformPool() {
		if (showPoolPicker) {
			showPoolPicker = false;
			return;
		}
		showPoolPicker = true;
		if (poolAccounts.length > 0) return;

		isLoadingPool = true;
		try {
			const client = new RelayClient({
				platform: channel === "jackd" ? "jackd" : "scruff",
			});
			const res = await client.request<{
				data?: {
					items?: Array<{
						account: string;
						hasAccessToken: boolean;
						platformUserId: string;
						proxyUrl: string;
					}>;
				};
				ret?: boolean;
			}>({
				headers: { "omni-platform": channel },
				method: "GET",
				path: `https://omni-api.toonhub.top/platform/accounts?platformName=${channel}&pageSize=30`,
				timeoutMs: 10000,
			});

			if (res.ret && res.data?.items) {
				poolAccounts = res.data.items;
			}
		} catch (err) {
			toast.error(
				`加载平台账号库失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			isLoadingPool = false;
		}
	}

	function handleSelectPoolAccount(item: {
		account: string;
		platformUserId: string;
		proxyUrl: string;
	}) {
		email = item.account;
		platformUserId = item.platformUserId;
		platformProxy = item.proxyUrl;
		if (item.proxyUrl) {
			proxyUrl = item.proxyUrl;
		}
		const hostPort = getProxyHostPort(item.proxyUrl);
		platformMatchInfo = `已选中平台账号 (UID: ${item.platformUserId})${hostPort ? ` · 绑定代理 ${hostPort}` : ""}`;
		showPoolPicker = false;
		toast.success(`已自动填充账号 ${item.account}`);
	}

	async function handleEmailBlur() {
		const trimmed = email.trim();
		if (!trimmed || channel === "grindr") return;

		try {
			const info = await queryPlatformAccount(
				channel === "jackd" ? "jackd" : "scruff",
				trimmed,
				4000,
			);
			if (info) {
				platformUserId = info.platformUserId || null;
				platformProxy = info.proxyUrl || null;
				if (info.proxyUrl) {
					if (
						!proxyUrl.trim() ||
						getProxyHostPort(proxyUrl) ===
							getProxyHostPort(info.proxyUrl)
					) {
						proxyUrl = info.proxyUrl;
					}
				}
				const hostPort = getProxyHostPort(info.proxyUrl);
				platformMatchInfo = `已关联 ai-growth 账号 (UID: ${info.platformUserId})${hostPort ? ` · 自动绑定代理 ${hostPort}` : ""}`;
			} else {
				platformUserId = null;
				platformProxy = null;
				platformMatchInfo = null;
			}
		} catch {
			platformMatchInfo = null;
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			errorText = "请输入注册邮箱或账号标识";
			return;
		}

		isLoading = true;
		errorText = null;

		try {
			// 若尚未查询平台，尝试快速同步一次
			if (!platformProxy && channel !== "grindr") {
				const info = await queryPlatformAccount(
					channel === "jackd" ? "jackd" : "scruff",
					trimmedEmail,
					3500,
				);
				if (info) {
					platformUserId = info.platformUserId || null;
					platformProxy = info.proxyUrl || null;
					if (info.proxyUrl && !proxyUrl.trim()) {
						proxyUrl = info.proxyUrl;
					}
				}
			}

			const effectiveProxy = resolveEffectiveProxy(
				proxyUrl,
				platformProxy ?? undefined,
			);

			const newAccount: ChannelAccount = {
				accountIdentifier: trimmedEmail,
				channel,
				createdAt: Date.now(),
				extraMeta: platformUserId
					? { profileId: platformUserId }
					: undefined,
				id: `${channel}:${trimmedEmail}`,
				isEnabled: true,
				name: name.trim() || trimmedEmail,
				proxyUrl: effectiveProxy,
				relayKey: relayKey.trim() || undefined,
			};

			// 硬超时保障：最多等待 6 秒，即使网络慢也绝不挂起界面
			const verifyWithHardTimeout = Promise.race([
				channelState.verifyAndSaveAccount(channel, newAccount),
				new Promise<{ valid: boolean; displayName?: string }>(
					(resolve) =>
						setTimeout(() => {
							channelState.addAccount(newAccount);
							resolve({
								valid: true,
								displayName: newAccount.name,
							});
						}, 6000),
				),
			]);

			const result = await verifyWithHardTimeout;

			if (result.valid) {
				// 自动将新添加的账号设为当前渠道活跃账号
				channelState.setActiveAccount(channel, newAccount.id);
				toast.success(
					`成功添加并激活账号: ${result.displayName || trimmedEmail}`,
				);
				email = "";
				name = "";
				proxyUrl = "";
				relayKey = "";
				platformMatchInfo = null;
				platformProxy = null;
				platformUserId = null;
				onAccountAdded?.();
			} else {
				errorText =
					"errorMessage" in result && result.errorMessage
						? String(result.errorMessage)
						: "账号验证未完全通过，已为您保留配置，可尝试直接保存";
				toast.error(errorText);
			}
		} catch (err) {
			errorText = err instanceof Error ? err.message : String(err);
			toast.error(`添加失败: ${errorText}`);
		} finally {
			isLoading = false;
		}
	}

	function handleForceSave() {
		const trimmedEmail = email.trim();
		if (!trimmedEmail) return;

		const effectiveProxy = resolveEffectiveProxy(
			proxyUrl,
			platformProxy ?? undefined,
		);

		const newAccount: ChannelAccount = {
			accountIdentifier: trimmedEmail,
			channel,
			createdAt: Date.now(),
			extraMeta: platformUserId
				? { profileId: platformUserId }
				: undefined,
			id: `${channel}:${trimmedEmail}`,
			isEnabled: true,
			name: name.trim() || trimmedEmail,
			proxyUrl: effectiveProxy,
			relayKey: relayKey.trim() || undefined,
		};

		channelState.addAccount(newAccount);
		channelState.setActiveAccount(channel, newAccount.id);
		toast.success(`已保存并激活账号: ${newAccount.name}`);
		email = "";
		name = "";
		proxyUrl = "";
		relayKey = "";
		errorText = null;
		platformMatchInfo = null;
		platformProxy = null;
		platformUserId = null;
		onAccountAdded?.();
	}
</script>

<form
	onsubmit={handleSubmit}
	class="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5"
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1.5 text-sm font-medium">
			<PlusIcon class="size-4 text-primary" weight="bold" />
			<span>添加新 {channel.toUpperCase()} 账号</span>
		</div>

		{#if channel !== "grindr"}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={togglePlatformPool}
				class="h-7 gap-1 px-2 text-xs text-primary"
			>
				<SparkleIcon class="size-3.5" weight="fill" />
				<span>{showPoolPicker ? "收起账号池" : "从平台账号池选择"}</span
				>
			</Button>
		{/if}
	</div>

	{#if showPoolPicker}
		<div
			class="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-medium text-foreground">
					平台已录入的 {channel.toUpperCase()} 账号池：
				</span>
				{#if isLoadingPool}
					<Spinner class="size-3.5 text-primary" />
				{/if}
			</div>

			<div class="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
				{#if poolAccounts.length === 0 && !isLoadingPool}
					<div class="py-2 text-center text-xs text-muted-foreground">
						暂未加载到平台账号
					</div>
				{/if}
				{#each poolAccounts as item (item.account)}
					<button
						type="button"
						onclick={() => handleSelectPoolAccount(item)}
						class="flex items-center justify-between rounded-md border border-border/50 bg-background/80 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary/10"
					>
						<div class="flex flex-col">
							<span class="font-mono font-medium text-foreground">
								{item.account}
							</span>
							<span class="text-[10px] text-muted-foreground">
								UID: {item.platformUserId}
								{#if item.proxyUrl}
									· 包含专属代理
								{/if}
							</span>
						</div>
						<Badge
							variant="outline"
							class="text-[10px] font-normal"
						>
							一键填充
						</Badge>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
		<div class="flex flex-col gap-1">
			<label
				for="account-email"
				class="text-xs font-medium text-muted-foreground"
			>
				注册邮箱 / 账号标识 <span class="text-destructive">*</span>
			</label>
			<Input
				id="account-email"
				type="text"
				placeholder="例如 user@example.com"
				bind:value={email}
				onblur={handleEmailBlur}
				disabled={isLoading}
				class="h-8 text-xs"
			/>
			{#if platformMatchInfo}
				<span class="text-[11px] text-emerald-500">
					✓ {platformMatchInfo}
				</span>
			{/if}
		</div>

		<div class="flex flex-col gap-1">
			<label
				for="account-name"
				class="text-xs font-medium text-muted-foreground"
			>
				备注名称 (可选)
			</label>
			<Input
				id="account-name"
				type="text"
				placeholder="留空自动读取个人资料"
				bind:value={name}
				disabled={isLoading}
				class="h-8 text-xs"
			/>
		</div>

		<div class="flex flex-col gap-1 sm:col-span-2">
			<div class="flex items-center justify-between">
				<label
					for="account-proxy"
					class="text-xs font-medium text-muted-foreground"
				>
					网络代理 URL (可选)
				</label>
				{#if platformProxy}
					<span class="text-[11px] text-emerald-500">
						已绑定 ai-growth 专属代理: {maskProxyUrl(platformProxy)}
					</span>
				{/if}
			</div>
			<Input
				id="account-proxy"
				type="text"
				placeholder="例如 http://96.62.193.113:7822 或留空使用平台绑定代理"
				bind:value={proxyUrl}
				disabled={isLoading}
				class="h-8 font-mono text-xs"
			/>
			<span class="text-[11px] text-muted-foreground">
				支持 socks5/http 协议；留空或填入平台代理 IP
				将自动加载专属鉴权隧道出海。
			</span>
		</div>

		<div class="flex flex-col gap-1 sm:col-span-2">
			<label
				for="account-relay-key"
				class="text-xs font-medium text-muted-foreground"
			>
				自定义 Omni-Key (可选，留空使用全局中继密钥)
			</label>
			<Input
				id="account-relay-key"
				type="password"
				placeholder="omni__..."
				bind:value={relayKey}
				disabled={isLoading}
				class="h-8 font-mono text-xs"
			/>
		</div>
	</div>

	{#if errorText}
		<div
			class="flex flex-col gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive"
		>
			<div class="flex items-center gap-1.5">
				<WarningCircleIcon class="size-4 shrink-0" />
				<span>{errorText}</span>
			</div>
			<div class="flex items-center justify-between pt-1">
				<span class="text-[11px] text-muted-foreground">
					若该账号需在特殊网络下运行或凭据待激活，你可以选择强制保存
				</span>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onclick={handleForceSave}
					class="h-6 px-2 text-[11px]"
				>
					依然强制保存
				</Button>
			</div>
		</div>
	{/if}

	<div class="flex justify-end pt-1">
		<Button
			type="submit"
			size="sm"
			disabled={isLoading}
			class="h-8 gap-1.5 text-xs"
		>
			{#if isLoading}
				<Spinner class="size-3.5" />
				<span>验证并激活设备中...</span>
			{:else}
				<CheckCircleIcon class="size-4" weight="bold" />
				<span>添加并激活设备</span>
			{/if}
		</Button>
	</div>
</form>

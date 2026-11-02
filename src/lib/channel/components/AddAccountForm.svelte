<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { toast } from "svelte-sonner";

	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import { channelState } from "../channel-state.svelte";
	import type { SocialChannelType } from "../types";

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
			const newAccount = {
				id: `${channel}:${trimmedEmail}`,
				channel,
				accountIdentifier: trimmedEmail,
				name: name.trim() || trimmedEmail,
				proxyUrl: proxyUrl.trim() || undefined,
				relayKey: relayKey.trim() || undefined,
				isEnabled: true,
				createdAt: Date.now(),
			};

			const result = await channelState.verifyAndSaveAccount(
				channel,
				newAccount,
			);

			if (result.valid) {
				toast.success(
					`成功添加并验证账号: ${result.displayName || trimmedEmail}`,
				);
				email = "";
				name = "";
				proxyUrl = "";
				relayKey = "";
				onAccountAdded?.();
			} else {
				errorText =
					result.errorMessage ||
					"账号验证或设备激活未成功，请检查中继配置与网络";
				toast.error(errorText);
			}
		} catch (err) {
			errorText = err instanceof Error ? err.message : String(err);
			toast.error(`添加失败: ${errorText}`);
		} finally {
			isLoading = false;
		}
	}
</script>

<form
	onsubmit={handleSubmit}
	class="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5"
>
	<div class="flex items-center gap-1.5 text-sm font-medium">
		<PlusIcon class="size-4 text-primary" weight="bold" />
		<span>添加新 {channel.toUpperCase()} 账号</span>
	</div>

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
				disabled={isLoading}
				class="h-8 text-xs"
			/>
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
			<label
				for="account-proxy"
				class="text-xs font-medium text-muted-foreground"
			>
				网络代理 URL (可选)
			</label>
			<Input
				id="account-proxy"
				type="text"
				placeholder="socks5://127.0.0.1:1080 或 http://127.0.0.1:7890"
				bind:value={proxyUrl}
				disabled={isLoading}
				class="h-8 font-mono text-xs"
			/>
			<span class="text-[11px] text-muted-foreground">
				支持 socks5/http 协议，由中继后端建立隧道，确保请求独立出海。
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
			class="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
		>
			{errorText}
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

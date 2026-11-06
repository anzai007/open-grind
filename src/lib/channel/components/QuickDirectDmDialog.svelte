<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import DiceFiveIcon from "phosphor-svelte/lib/DiceFiveIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";
	import UserCircleIcon from "phosphor-svelte/lib/UserCircleIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import { channelState } from "../channel-state.svelte";
	import {
		DEFAULT_DIRECT_DM_TARGET_USER_IDS,
		templateState,
	} from "../template-state.svelte";
	import {
		CHANNEL_METAS,
		type DmTemplate,
		type SocialChannelType,
	} from "../types";

	const CHANNELS: SocialChannelType[] = [
		"scruff",
		"jackd",
		"heesay",
		"sub",
		"grindr",
	];

	let selectedChannel = $state<SocialChannelType>("scruff");
	let targetUserId = $state<string>("");
	let targetDisplayName = $state<string>("");
	let selectedGroupCode = $state<string>("");
	let selectedTemplateId = $state<string>("");
	let customMessageText = $state<string>("");
	let isSending = $state(false);

	let lastSentResult = $state<{
		id: string;
		displayName: string;
		text: string;
		channel: SocialChannelType;
		timestamp: number;
	} | null>(null);

	// 当前渠道的元数据与账号状态
	const currentMeta = $derived(CHANNEL_METAS[selectedChannel]);
	const currentGroups = $derived(templateState.getGroups(selectedChannel));
	const currentTemplates = $derived(
		templateState.getTemplates(
			selectedChannel,
			selectedGroupCode || undefined,
		),
	);
	const activeAccount = $derived.by(() => {
		if (selectedChannel === "grindr") {
			return channelState.accounts.grindr[0] || null;
		}
		const activeId = channelState.activeAccountIds[selectedChannel];
		if (activeId) {
			return (
				channelState.accounts[selectedChannel].find(
					(a) => a.id === activeId,
				) || null
			);
		}
		return channelState.accounts[selectedChannel][0] || null;
	});

	// 实时模版插值预览
	const previewText = $derived(
		templateState.interpolateTemplate(customMessageText, {
			displayName: targetDisplayName.trim() || undefined,
		}),
	);

	// 当弹窗打开时，同步初始数据
	$effect(() => {
		if (templateState.isDirectDmOpen) {
			const ch =
				templateState.directDmSelectedChannel ||
				channelState.activeChannel;
			selectedChannel = ch;

			const defaultId = DEFAULT_DIRECT_DM_TARGET_USER_IDS[ch] || "";
			targetUserId = templateState.directDmTargetUserId || defaultId;
			targetDisplayName = "";
			lastSentResult = null;

			// 同步活跃模版组
			const activeGrp = templateState.getActiveGroup(ch);
			selectedGroupCode = activeGrp?.groupCode || "";
			pickRandomOrFirstTemplate(ch, selectedGroupCode);
		}
	});

	// 当在弹窗内切换渠道时
	function handleChannelSwitch(ch: SocialChannelType) {
		if (selectedChannel === ch) return;
		selectedChannel = ch;

		// 检查当前输入的 targetUserId 是否为之前渠道的默认ID，或者是空的，自动切为新渠道默认ID
		const isOldDefault = Object.entries(
			DEFAULT_DIRECT_DM_TARGET_USER_IDS,
		).some(
			([oldCh, defaultVal]) =>
				oldCh !== ch && targetUserId === defaultVal,
		);

		if (!targetUserId.trim() || isOldDefault) {
			targetUserId = DEFAULT_DIRECT_DM_TARGET_USER_IDS[ch] || "";
		}

		// 同步活跃模版组
		const activeGrp = templateState.getActiveGroup(ch);
		selectedGroupCode = activeGrp?.groupCode || "";
		pickRandomOrFirstTemplate(ch, selectedGroupCode);

		// 同步全局 activeChannel，使当前 WebSocket 长链与网络会话对齐
		if (channelState.activeChannel !== ch) {
			channelState.switchChannel(ch);
		}
	}

	function handleGroupSwitch(groupCode: string) {
		selectedGroupCode = groupCode;
		pickRandomOrFirstTemplate(selectedChannel, groupCode);
	}

	function pickRandomOrFirstTemplate(
		ch: SocialChannelType,
		groupCode?: string,
	) {
		const templates = templateState
			.getTemplates(ch, groupCode || undefined)
			.filter((t) => t.enabled);

		if (templates.length > 0) {
			const randomIndex = Math.floor(Math.random() * templates.length);
			const picked = templates[randomIndex]!;
			selectedTemplateId = picked.id;
			customMessageText = picked.content;
		} else {
			selectedTemplateId = "";
			customMessageText = "";
		}
	}

	function handleRandomize() {
		const templates = templateState
			.getTemplates(selectedChannel, selectedGroupCode || undefined)
			.filter((t) => t.enabled);

		if (templates.length === 0) {
			toast.info("当前组暂无启用的模版");
			return;
		}

		// 尽量挑与当前不同的
		const candidates =
			templates.length > 1
				? templates.filter((t) => t.id !== selectedTemplateId)
				: templates;
		const next =
			candidates[Math.floor(Math.random() * candidates.length)] ||
			templates[0]!;

		selectedTemplateId = next.id;
		customMessageText = next.content;
		toast.info(`已随机抽取模版: ${next.title || "私信模版"}`, {
			duration: 1500,
		});
	}

	function handleSelectSpecificTemplate(t: DmTemplate) {
		selectedTemplateId = t.id;
		customMessageText = t.content;
	}

	function handleFillDefaultChip(ch: SocialChannelType, id: string) {
		if (selectedChannel !== ch) {
			handleChannelSwitch(ch);
		}
		targetUserId = id;
	}

	function insertVariableTag(tag: string) {
		customMessageText = `${customMessageText} ${tag}`.trim();
	}

	async function handleSend() {
		const rawId = targetUserId.trim();
		const rawText = customMessageText.trim();

		if (!rawId) {
			toast.error("请输入目标用户 ID", { duration: 2000 });
			return;
		}

		if (!rawText) {
			toast.error("私信内容不能为空，请选择模版或输入内容", {
				duration: 2000,
			});
			return;
		}

		if (selectedChannel !== "grindr" && !activeAccount) {
			toast.error(
				`当前 ${currentMeta.name} 渠道未登录账号，请先添加账号`,
				{ duration: 2000 },
			);
			channelState.openAccountDialog(selectedChannel);
			return;
		}

		isSending = true;

		try {
			// 计算插值后的文本
			const finalText = previewText || rawText;
			const displayName = targetDisplayName.trim() || `User ${rawId}`;

			// 统一走 templateState.sendQuickDm 底层通道，确保通道与用户网格完全一致
			const res = await templateState.sendQuickDm(
				{ id: rawId, displayName },
				finalText,
				selectedChannel,
			);

			if (res.success) {
				lastSentResult = {
					id: rawId,
					displayName,
					text: finalText,
					channel: selectedChannel,
					timestamp: Date.now(),
				};
			}
		} finally {
			isSending = false;
		}
	}

	function handleSendAnother() {
		lastSentResult = null;
		// 重新随机抽取一条模版
		pickRandomOrFirstTemplate(selectedChannel, selectedGroupCode);
	}
</script>

<Dialog.Root
	open={templateState.isDirectDmOpen}
	onOpenChange={(v) => {
		if (!v) templateState.closeDirectDmDialog();
	}}
>
	<Dialog.Content
		class="flex max-h-[90vh] w-[94vw] max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background p-0 shadow-2xl"
	>
		<!-- 弹窗顶栏 -->
		<Dialog.Header
			class="flex flex-row items-center justify-between border-b border-border/60 px-5 py-3.5"
		>
			<div class="flex items-center gap-2.5">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
				>
					<PaperPlaneRightIcon class="size-4.5" weight="fill" />
				</div>
				<div>
					<Dialog.Title
						class="text-base font-semibold text-foreground"
					>
						快捷私信指定 (Direct Quick DM)
					</Dialog.Title>
					<p class="text-[11px] text-muted-foreground">
						直接指定用户 ID
						与模版发送私信，通道与用户列表快捷私信完全一致。
					</p>
				</div>
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

		<!-- 渠道切换 Tab 栏 -->
		<div
			class="flex items-center justify-between border-b border-border/40 bg-muted/20 px-5 py-2"
		>
			<div class="flex items-center gap-1.5 overflow-x-auto">
				{#each CHANNELS as ch (ch)}
					{@const meta = CHANNEL_METAS[ch]}
					{@const isSelected = selectedChannel === ch}
					{@const hasAcc =
						ch === "grindr" ||
						(channelState.accounts[ch]?.length ?? 0) > 0}
					<button
						type="button"
						onclick={() => handleChannelSwitch(ch)}
						class={[
							"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
							{
								"bg-background text-foreground shadow-xs ring-1 ring-border/80":
									isSelected,
								"text-muted-foreground hover:bg-muted/60 hover:text-foreground":
									!isSelected,
							},
						]}
					>
						<span
							class="size-2 rounded-full"
							style:background-color={meta.brandColor}
						></span>
						<span>{meta.name}</span>
						{#if !hasAcc}
							<span
								class="size-1.5 rounded-full bg-destructive"
								title="无有效账号"
							></span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- 账号状态展示 -->
			<div class="hidden items-center gap-2 sm:flex">
				{#if selectedChannel === "grindr"}
					<Badge
						variant="secondary"
						class="h-5 gap-1 px-2 font-mono text-[10px] text-muted-foreground"
					>
						<span class="size-1.5 rounded-full bg-emerald-500"
						></span>
						Grindr 本地就绪
					</Badge>
				{:else if activeAccount}
					<button
						type="button"
						onclick={() =>
							channelState.openAccountDialog(selectedChannel)}
						class="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						title="点击切换或管理账号"
					>
						<span class="size-1.5 rounded-full bg-emerald-500"
						></span>
						<span class="max-w-28 truncate"
							>{activeAccount.name}</span
						>
					</button>
				{:else}
					<button
						type="button"
						onclick={() =>
							channelState.openAccountDialog(selectedChannel)}
						class="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
					>
						<WarningCircleIcon class="size-3" weight="bold" />
						<span>未登录账号</span>
					</button>
				{/if}
			</div>
		</div>

		<!-- 弹窗主体内容 -->
		<div class="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
			{#if lastSentResult}
				<!-- 发送成功提示条 -->
				<div
					class="flex items-start justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-900 dark:text-emerald-200"
				>
					<div class="flex items-start gap-2.5">
						<CheckCircleIcon
							class="mt-0.5 size-5 shrink-0 text-emerald-500"
							weight="fill"
						/>
						<div class="space-y-1">
							<p class="font-semibold">私信已发送成功！</p>
							<p class="text-[11px] opacity-90">
								渠道: <span class="font-mono font-bold"
									>{CHANNEL_METAS[lastSentResult.channel]
										.name}</span
								>
								| 目标:
								<span class="font-mono font-bold"
									>{lastSentResult.displayName} ({lastSentResult.id})</span
								>
							</p>
							<div
								class="rounded-md bg-background/80 px-2.5 py-1.5 font-mono text-[11px] text-foreground shadow-xs"
							>
								"{lastSentResult.text}"
							</div>
						</div>
					</div>

					<Button
						size="sm"
						variant="outline"
						onclick={handleSendAnother}
						class="h-7 text-xs"
					>
						继续发送
					</Button>
				</div>
			{/if}

			<!-- 第一区：目标用户设定 -->
			<div
				class="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3.5"
			>
				<div class="flex items-center justify-between">
					<label
						for="target-user-id"
						class="flex items-center gap-1.5 font-semibold text-foreground"
					>
						<UserCircleIcon
							class="size-4 text-primary"
							weight="bold"
						/>
						<span>目标用户 ID (必填)</span>
					</label>

					<!-- 渠道默认ID快速填充 chips -->
					<div
						class="flex items-center gap-1 text-[11px] text-muted-foreground"
					>
						<span class="hidden sm:inline">默认 ID:</span>
						{#each CHANNELS.filter( (c) => Boolean(DEFAULT_DIRECT_DM_TARGET_USER_IDS[c]), ) as c (c)}
							{@const defId =
								DEFAULT_DIRECT_DM_TARGET_USER_IDS[c]}
							{@const meta = CHANNEL_METAS[c]}
							<button
								type="button"
								onclick={() => handleFillDefaultChip(c, defId)}
								class={[
									"flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
									{
										"bg-primary font-semibold text-primary-foreground":
											targetUserId === defId &&
											selectedChannel === c,
										"bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground":
											targetUserId !== defId ||
											selectedChannel !== c,
									},
								]}
								title={`填入 ${meta.name} 默认 ID: ${defId}`}
							>
								<span
									class="size-1.5 rounded-full"
									style:background-color={meta.brandColor}
								></span>
								<span>{meta.shortName}: {defId}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
					<div class="sm:col-span-2">
						<Input
							id="target-user-id"
							bind:value={targetUserId}
							placeholder={`请输入 ${currentMeta.name} 目标用户 ID，如 ${DEFAULT_DIRECT_DM_TARGET_USER_IDS[selectedChannel] || "12345678"}`}
							class="font-mono text-xs"
							disabled={isSending}
						/>
					</div>
					<div>
						<Input
							bind:value={targetDisplayName}
							placeholder="目标昵称 (选填，替换变量)"
							class="text-xs"
							disabled={isSending}
						/>
					</div>
				</div>
			</div>

			<!-- 第二区：模版选择与插值 -->
			<div
				class="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3.5"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<SparkleIcon
							class="size-4 text-primary"
							weight="bold"
						/>
						<span class="font-semibold text-foreground"
							>私信模版与内容</span
						>
					</div>

					<div class="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							onclick={handleRandomize}
							class="h-7 gap-1 px-2.5 text-xs text-primary"
							title="随机从该组中抽取一条模版"
						>
							<DiceFiveIcon class="size-3.5" weight="bold" />
							<span>🎲 随机换一条</span>
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onclick={() => templateState.openDialog()}
							class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
							title="打开模版管理库"
						>
							管理模版库
						</Button>
					</div>
				</div>

				<!-- 模版组选项卡 -->
				{#if currentGroups.length > 0}
					<div class="flex flex-wrap items-center gap-1.5">
						{#each currentGroups as grp (grp.groupCode)}
							{@const isGrpSelected =
								selectedGroupCode === grp.groupCode}
							<button
								type="button"
								onclick={() => handleGroupSwitch(grp.groupCode)}
								class={[
									"rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
									{
										"bg-primary font-semibold text-primary-foreground shadow-xs":
											isGrpSelected,
										"bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground":
											!isGrpSelected,
									},
								]}
							>
								{grp.groupName}
							</button>
						{/each}
					</div>
				{/if}

				<!-- 可选模版卡片列表 (水平滚动) -->
				{#if currentTemplates.length > 0}
					<div
						class="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1"
					>
						{#each currentTemplates as tpl (tpl.id)}
							{@const isTplSelected =
								selectedTemplateId === tpl.id}
							<button
								type="button"
								onclick={() =>
									handleSelectSpecificTemplate(tpl)}
								class={[
									"max-w-48 shrink-0 truncate rounded-lg border p-2 text-left transition-all",
									{
										"border-primary bg-primary/10 text-foreground ring-1 ring-primary/50":
											isTplSelected,
										"border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground":
											!isTplSelected,
									},
								]}
								title={tpl.content}
							>
								<p class="truncate text-[11px] font-semibold">
									{tpl.title}
								</p>
								<p class="truncate text-[10px] opacity-80">
									{tpl.content}
								</p>
							</button>
						{/each}
					</div>
				{/if}

				<!-- 私信内容微调编辑区 -->
				<div class="space-y-1.5">
					<div
						class="flex items-center justify-between text-[11px] text-muted-foreground"
					>
						<span>私信内容 (支持输入或直接修改):</span>
						<div class="flex items-center gap-1">
							<span class="text-[10px]">插入变量:</span>
							<button
								type="button"
								onclick={() => insertVariableTag("{name}")}
								class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-muted/80"
								title="点击插入对方昵称占位符"
							>
								&#123;name&#125;
							</button>
						</div>
					</div>

					<Textarea
						bind:value={customMessageText}
						rows={3}
						placeholder="输入或微调发送内容..."
						class="resize-none text-xs leading-relaxed"
						disabled={isSending}
					/>
				</div>

				<!-- 实时最终预览 -->
				{#if customMessageText.trim()}
					<div
						class="rounded-lg border border-border/40 bg-muted/30 p-2.5"
					>
						<span
							class="text-[10px] font-medium text-muted-foreground"
							>最终发送内容预览:</span
						>
						<p class="mt-0.5 text-xs font-medium text-foreground">
							{previewText || customMessageText}
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- 弹窗底栏操作 -->
		<Dialog.Footer
			class="flex flex-row items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3"
		>
			<div
				class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
			>
				<span class="size-1.5 rounded-full bg-emerald-500"></span>
				<span
					>通道与用户列表快捷私信完全一致 ({currentMeta.name} 统一 IM/接口)</span
				>
			</div>

			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					onclick={() => templateState.closeDirectDmDialog()}
					class="h-8 text-xs"
					disabled={isSending}
				>
					取消
				</Button>

				<Button
					size="sm"
					onclick={handleSend}
					disabled={isSending ||
						!targetUserId.trim() ||
						!customMessageText.trim() ||
						(selectedChannel !== "grindr" && !activeAccount)}
					class="h-8 gap-1.5 px-4 text-xs font-semibold shadow-xs"
				>
					{#if isSending}
						<Spinner class="size-3.5" />
						<span>发送中...</span>
					{:else}
						<PaperPlaneRightIcon class="size-3.5" weight="fill" />
						<span>快捷发送私信</span>
					{/if}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

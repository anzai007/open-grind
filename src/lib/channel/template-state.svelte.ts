import { toast } from "svelte-sonner";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { channelChatState } from "./channel-chat-state.svelte";
import { channelState } from "./channel-state.svelte";
import {
	DEFAULT_TEMPLATE_GROUPS,
	DEFAULT_TEMPLATES,
} from "./default-templates";
import {
	CHANNEL_METAS,
	type DmTemplate,
	type DmTemplateGroup,
	type SocialChannelType,
} from "./types";

export const DEFAULT_DIRECT_DM_TARGET_USER_IDS: Record<
	SocialChannelType,
	string
> = {
	scruff: "202040775",
	heesay: "111117647",
	jackd: "202279231",
	sub: "1063461581229215744",
	grindr: "",
};

const STORAGE_KEY_TEMPLATES = "og_channel_dm_templates_v1";
const STORAGE_KEY_ACTIVE_GROUPS = "og_active_template_groups_v1";

export class TemplateState {
	templates = $state<DmTemplate[]>([]);
	groups = $state<DmTemplateGroup[]>([]);
	activeGroupCodes = $state<Record<SocialChannelType, string>>({
		grindr: "grindr_first_touch_zh_cn_greeting",
		scruff: "scruff_casual_greetings_en",
		jackd: "jackd_korean_casual_greetings",
		heesay: "heesay_casual_greetings_zh",
		sub: "sub_casual_greetings_zh",
	});

	isDialogOpen = $state(false);
	isDirectDmOpen = $state(false);
	directDmSelectedChannel = $state<SocialChannelType>("scruff");
	directDmTargetUserId = $state("");
	sendingUserIds = new SvelteSet<string>();

	constructor() {
		this.loadFromStorage();
	}

	private loadFromStorage(): void {
		if (typeof window === "undefined" || !window.localStorage) {
			this.templates = [...DEFAULT_TEMPLATES];
			this.groups = [...DEFAULT_TEMPLATE_GROUPS];
			return;
		}

		try {
			const storedTpls = window.localStorage.getItem(
				STORAGE_KEY_TEMPLATES,
			);
			if (storedTpls) {
				const parsed = JSON.parse(storedTpls) as DmTemplate[];
				if (Array.isArray(parsed) && parsed.length > 0) {
					this.templates = parsed;
				} else {
					this.templates = [...DEFAULT_TEMPLATES];
				}
			} else {
				this.templates = [...DEFAULT_TEMPLATES];
			}

			const storedGroups = window.localStorage.getItem(
				STORAGE_KEY_ACTIVE_GROUPS,
			);
			if (storedGroups) {
				const parsed = JSON.parse(storedGroups) as Record<
					SocialChannelType,
					string
				>;
				if (parsed && typeof parsed === "object") {
					this.activeGroupCodes = {
						...this.activeGroupCodes,
						...parsed,
					};
				}
			}

			// 自动提取或补全模板组
			this.recomputeGroups();
		} catch {
			this.templates = [...DEFAULT_TEMPLATES];
			this.groups = [...DEFAULT_TEMPLATE_GROUPS];
		}
	}

	private saveToStorage(): void {
		if (typeof window === "undefined" || !window.localStorage) return;
		try {
			window.localStorage.setItem(
				STORAGE_KEY_TEMPLATES,
				JSON.stringify(this.templates),
			);
			window.localStorage.setItem(
				STORAGE_KEY_ACTIVE_GROUPS,
				JSON.stringify(this.activeGroupCodes),
			);
		} catch {
			// ignore quota errors
		}
	}

	private recomputeGroups(): void {
		const groupMap = new SvelteMap<string, DmTemplateGroup>();

		// 先放入预置组元数据
		for (const g of DEFAULT_TEMPLATE_GROUPS) {
			groupMap.set(`${g.channel}:${g.groupCode}`, g);
		}

		// 再根据当前模板反向补充自定义组
		for (const t of this.templates) {
			const key = `${t.channel}:${t.groupCode}`;
			if (!groupMap.has(key)) {
				groupMap.set(key, {
					channel: t.channel,
					groupCode: t.groupCode,
					groupName: t.groupName || t.groupCode,
				});
			}
		}

		this.groups = Array.from(groupMap.values());
	}

	openDialog(): void {
		this.isDialogOpen = true;
	}

	closeDialog(): void {
		this.isDialogOpen = false;
	}

	openDirectDmDialog(
		options?: { channel?: SocialChannelType; userId?: string } | string,
	): void {
		let ch: SocialChannelType = channelState.activeChannel;
		let uid: string | undefined;

		if (typeof options === "string") {
			uid = options;
		} else if (options && typeof options === "object") {
			if (options.channel) ch = options.channel;
			if (options.userId) uid = options.userId;
		}

		this.directDmSelectedChannel = ch;
		const defaultId = DEFAULT_DIRECT_DM_TARGET_USER_IDS[ch] || "";
		this.directDmTargetUserId = uid?.trim() ? uid.trim() : defaultId;
		this.isDirectDmOpen = true;
	}

	closeDirectDmDialog(): void {
		this.isDirectDmOpen = false;
	}

	getGroups(channel: SocialChannelType): DmTemplateGroup[] {
		return this.groups.filter((g) => g.channel === channel);
	}

	getActiveGroup(channel: SocialChannelType): DmTemplateGroup | null {
		const code = this.activeGroupCodes[channel];
		const groups = this.getGroups(channel);
		if (code) {
			const found = groups.find((g) => g.groupCode === code);
			if (found) return found;
		}
		return groups[0] ?? null;
	}

	setActiveGroup(channel: SocialChannelType, groupCode: string): void {
		this.activeGroupCodes = {
			...this.activeGroupCodes,
			[channel]: groupCode,
		};
		this.saveToStorage();
	}

	getTemplates(channel: SocialChannelType, groupCode?: string): DmTemplate[] {
		return this.templates.filter((t) => {
			if (t.channel !== channel) return false;
			if (groupCode && t.groupCode !== groupCode) return false;
			return true;
		});
	}

	addTemplate(data: Omit<DmTemplate, "id" | "createdAt">): DmTemplate {
		const newTpl: DmTemplate = {
			...data,
			id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			createdAt: Date.now(),
		};

		this.templates = [newTpl, ...this.templates];
		this.recomputeGroups();
		this.saveToStorage();
		return newTpl;
	}

	updateTemplate(id: string, updates: Partial<DmTemplate>): void {
		this.templates = this.templates.map((t) =>
			t.id === id ? { ...t, ...updates } : t,
		);
		this.recomputeGroups();
		this.saveToStorage();
	}

	deleteTemplate(id: string): void {
		this.templates = this.templates.filter((t) => t.id !== id);
		this.recomputeGroups();
		this.saveToStorage();
	}

	createGroup(
		channel: SocialChannelType,
		groupName: string,
	): DmTemplateGroup {
		const trimmed = groupName.trim();
		const code = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
		const newGroup: DmTemplateGroup = {
			channel,
			groupCode: code,
			groupName: trimmed || "新私信模版组",
		};

		this.groups = [...this.groups, newGroup];
		this.setActiveGroup(channel, code);
		this.saveToStorage();
		return newGroup;
	}

	addGroup(channel: SocialChannelType, groupName: string): DmTemplateGroup {
		return this.createGroup(channel, groupName);
	}

	deleteGroup(channel: SocialChannelType, groupCode: string): void {
		// 删除该组下的所有模版
		this.templates = this.templates.filter(
			(t) => !(t.channel === channel && t.groupCode === groupCode),
		);
		this.groups = this.groups.filter(
			(g) => !(g.channel === channel && g.groupCode === groupCode),
		);

		// 如果被删除的是当前激活组，重置到第一个可用组
		if (this.activeGroupCodes[channel] === groupCode) {
			const remaining = this.getGroups(channel);
			if (remaining.length > 0 && remaining[0]) {
				this.activeGroupCodes[channel] = remaining[0].groupCode;
			}
		}

		this.saveToStorage();
	}

	resetToDefaults(channel?: SocialChannelType): void {
		if (channel) {
			const otherTemplates = this.templates.filter(
				(t) => t.channel !== channel,
			);
			const defaultChannelTpls = DEFAULT_TEMPLATES.filter(
				(t) => t.channel === channel,
			);
			this.templates = [...otherTemplates, ...defaultChannelTpls];

			const defaultGroup = DEFAULT_TEMPLATE_GROUPS.find(
				(g) => g.channel === channel,
			);
			if (defaultGroup) {
				this.activeGroupCodes[channel] = defaultGroup.groupCode;
			}
		} else {
			this.templates = [...DEFAULT_TEMPLATES];
			this.activeGroupCodes = {
				grindr: "grindr_first_touch_zh_cn_greeting",
				scruff: "scruff_casual_greetings_en",
				jackd: "jackd_korean_casual_greetings",
				heesay: "heesay_casual_greetings_zh",
				sub: "sub_casual_greetings_zh",
			};
		}

		this.recomputeGroups();
		this.saveToStorage();
	}

	interpolateTemplate(
		templateText: string,
		targetUser?: { displayName?: string },
	): string {
		const processedText = templateText;
		const rawName = targetUser?.displayName?.trim();
		const cleanName =
			rawName && !rawName.startsWith("User ") ? rawName : "";

		return processedText
			.replace(/\{\{\s*display_name\s*\}\}/gi, cleanName)
			.replace(/\{\s*display_name\s*\}/gi, cleanName)
			.replace(/\{\{\s*name\s*\}\}/gi, cleanName)
			.replace(/\{\s*name\s*\}/gi, cleanName)
			.replace(/\s+/g, " ")
			.trim();
	}

	getRandomTemplate(
		channel: SocialChannelType,
		targetUser?: { displayName?: string },
	): { text: string; template: DmTemplate } | null {
		const activeGroup = this.getActiveGroup(channel);
		if (!activeGroup) return null;

		const availableTemplates = this.templates.filter(
			(t) =>
				t.channel === channel &&
				t.groupCode === activeGroup.groupCode &&
				t.enabled,
		);

		if (availableTemplates.length === 0) return null;

		const randomIndex = Math.floor(
			Math.random() * availableTemplates.length,
		);
		const selected = availableTemplates[randomIndex]!;

		// 智能插值变量：{name}、{{name}}、{display_name}、{{display_name}}
		const processedText = this.interpolateTemplate(
			selected.content,
			targetUser,
		);

		return { text: processedText, template: selected };
	}

	async sendQuickDm(
		user: { id: string; displayName?: string; avatarThumbnailUrl?: string },
		customText?: string,
		channelOverride?: SocialChannelType,
	): Promise<{ success: boolean; text?: string; error?: string }> {
		const channel = channelOverride ?? channelState.activeChannel;
		const userIdStr = String(user.id).trim();

		if (!userIdStr) {
			const toastId = toast.error("目标用户ID不能为空", {
				duration: 2000,
				closeButton: true,
			});
			setTimeout(() => toast.dismiss(toastId), 2000);
			return { success: false, error: "目标用户ID不能为空" };
		}

		if (this.sendingUserIds.has(userIdStr)) {
			return { success: false, error: "正在发送中，请勿重复点击" };
		}

		// 解析指定渠道所使用的账号
		let account =
			channel === channelState.activeChannel
				? channelState.currentAccount
				: undefined;

		if (!account && channel !== "grindr") {
			const activeId = channelState.activeAccountIds[channel];
			account = activeId
				? channelState.accounts[channel].find((a) => a.id === activeId)
				: channelState.accounts[channel][0];
		}

		if (channel !== "grindr" && !account) {
			const toastId = toast.error(
				`当前 ${CHANNEL_METAS[channel].name} 渠道尚未登录账号，请在右上角添加或选择账号`,
				{ duration: 2000, closeButton: true },
			);
			setTimeout(() => toast.dismiss(toastId), 2000);
			channelState.openAccountDialog(channel);
			return { success: false, error: "未登录账号" };
		}

		let text = customText?.trim();
		if (!text) {
			const pick = this.getRandomTemplate(channel, user);
			if (!pick) {
				const toastId = toast.error(
					`当前 ${CHANNEL_METAS[channel].name} 渠道未配置或未启用私信模版，请先在右上角管理私信模版`,
					{ duration: 2000, closeButton: true },
				);
				setTimeout(() => toast.dismiss(toastId), 2000);
				this.openDialog();
				return { success: false, error: "未配置可用模版" };
			}
			text = pick.text;
		}

		this.sendingUserIds.add(userIdStr);

		try {
			const provider =
				channelState.getProvider(channel) ??
				channelState.currentProvider;

			const sentMessage = await provider.sendMessage({
				account,
				conversationId: userIdStr,
				targetUserId: userIdStr,
				text,
			});

			if (channel !== "grindr") {
				channelChatState.recordSentMessage(
					{
						id: userIdStr,
						displayName: user.displayName || `User ${userIdStr}`,
						avatarThumbnailUrl: user.avatarThumbnailUrl,
					},
					sentMessage,
				);
			}

			const displayName = user.displayName || `ID: ${userIdStr}`;
			const toastId = toast.success(
				`已向 ${displayName} 发送快捷私信：\n"${text}"`,
				{ duration: 2000, closeButton: true },
			);
			setTimeout(() => {
				toast.dismiss(toastId);
			}, 2000);

			return { success: true, text };
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const toastId = toast.error(`私信发送失败：${errMsg}`, {
				duration: 2000,
				closeButton: true,
			});
			setTimeout(() => {
				toast.dismiss(toastId);
			}, 2500);
			return { success: false, error: errMsg };
		} finally {
			this.sendingUserIds.delete(userIdStr);
		}
	}
}

export const templateState = new TemplateState();

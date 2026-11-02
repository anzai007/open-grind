import { SvelteMap } from "svelte/reactivity";

import type { SocialChannelProvider, VerifyAccountResult } from "./provider";
import { GrindrProvider } from "./providers/grindr-provider";
import { JackdProvider } from "./providers/jackd-provider";
import { ScruffProvider } from "./providers/scruff-provider";
import {
	CHANNEL_METAS,
	type ChannelAccount,
	type ChannelMeta,
	type SocialChannelType,
	type UniversalInteractionResult,
	type UniversalUserProfile,
} from "./types";

const STORAGE_KEY_CHANNEL = "og_active_channel";
const STORAGE_KEY_ACCOUNTS = "og_channel_accounts";
const STORAGE_KEY_ACTIVE_ACCOUNTS = "og_active_channel_accounts";

export class ChannelState {
	activeChannel = $state<SocialChannelType>("grindr");
	accounts = $state<Record<SocialChannelType, ChannelAccount[]>>({
		grindr: [],
		scruff: [],
		jackd: [],
	});
	activeAccountIds = $state<Record<SocialChannelType, string | null>>({
		grindr: null,
		scruff: null,
		jackd: null,
	});
	isAccountDialogOpen = $state(false);
	dialogChannel = $state<SocialChannelType>("scruff");

	selectedUserProfile = $state<UniversalUserProfile | null>(null);
	isProfileOpen = $state(false);
	isProfileLoading = $state(false);
	profileError = $state<string | null>(null);

	private providers: SvelteMap<SocialChannelType, SocialChannelProvider> =
		new SvelteMap();

	constructor() {
		this.registerProvider("grindr", new GrindrProvider());
		this.registerProvider("scruff", new ScruffProvider());
		this.registerProvider("jackd", new JackdProvider());
		this.loadFromStorage();
	}

	currentProvider = $derived.by<SocialChannelProvider>(() => {
		const provider = this.providers.get(this.activeChannel);
		if (!provider) {
			// Fallback to Grindr
			return this.providers.get("grindr") ?? new GrindrProvider();
		}
		return provider;
	});

	currentMeta = $derived.by<ChannelMeta>(() => {
		return CHANNEL_METAS[this.activeChannel];
	});

	currentAccount = $derived.by<ChannelAccount | undefined>(() => {
		const accountId = this.activeAccountIds[this.activeChannel];
		if (!accountId) return undefined;
		return this.accounts[this.activeChannel].find(
			(a) => a.id === accountId,
		);
	});

	registerProvider(
		channel: SocialChannelType,
		provider: SocialChannelProvider,
	) {
		this.providers.set(channel, provider);
	}

	getProvider(channel: SocialChannelType): SocialChannelProvider | undefined {
		return this.providers.get(channel);
	}

	switchChannel(channel: SocialChannelType) {
		if (this.activeChannel === channel) return;
		this.activeChannel = channel;
		this.saveToStorage();
	}

	addAccount(account: ChannelAccount) {
		const list = this.accounts[account.channel];
		const existingIndex = list.findIndex((a) => a.id === account.id);
		if (existingIndex >= 0) {
			list[existingIndex] = account;
		} else {
			list.push(account);
		}

		if (!this.activeAccountIds[account.channel]) {
			this.activeAccountIds[account.channel] = account.id;
		}

		this.saveToStorage();
	}

	removeAccount(channel: SocialChannelType, accountId: string) {
		this.accounts[channel] = this.accounts[channel].filter(
			(a) => a.id !== accountId,
		);
		if (this.activeAccountIds[channel] === accountId) {
			this.activeAccountIds[channel] =
				this.accounts[channel][0]?.id ?? null;
		}
		this.saveToStorage();
	}

	setActiveAccount(channel: SocialChannelType, accountId: string | null) {
		this.activeAccountIds[channel] = accountId;
		this.saveToStorage();
	}

	openAccountDialog(channel?: SocialChannelType) {
		this.dialogChannel = channel ?? this.activeChannel;
		this.isAccountDialogOpen = true;
	}

	closeAccountDialog() {
		this.isAccountDialogOpen = false;
	}

	async openProfile(userId: string) {
		this.isProfileOpen = true;
		this.isProfileLoading = true;
		this.profileError = null;
		this.selectedUserProfile = null;

		try {
			const profile = await this.currentProvider.getUserDetail(
				userId,
				this.currentAccount,
			);
			this.selectedUserProfile = profile;
		} catch (err) {
			this.profileError =
				err instanceof Error ? err.message : String(err);
		} finally {
			this.isProfileLoading = false;
		}
	}

	closeProfile() {
		this.isProfileOpen = false;
		this.selectedUserProfile = null;
		this.profileError = null;
	}

	async sendInteraction(
		targetUserId: string,
	): Promise<UniversalInteractionResult> {
		return await this.currentProvider.sendInteraction(
			targetUserId,
			this.currentAccount,
		);
	}

	async verifyAndSaveAccount(
		channel: SocialChannelType,
		account: ChannelAccount,
	): Promise<VerifyAccountResult> {
		const provider = this.getProvider(channel);
		if (!provider?.verifyAccount) {
			this.addAccount(account);
			return { valid: true };
		}

		const result = await provider.verifyAccount(account);
		if (result.valid) {
			const updated: ChannelAccount = {
				...account,
				avatarUrl: result.avatarUrl || account.avatarUrl,
				extraMeta: {
					...(account.extraMeta ?? {}),
					profileId: result.profileId,
					verifiedAt: Date.now(),
				},
				name:
					result.displayName ||
					account.name ||
					account.accountIdentifier,
				proxyUrl: result.proxyUrl || account.proxyUrl,
			};
			this.addAccount(updated);
		}
		return result;
	}

	private loadFromStorage() {
		const storage =
			typeof window !== "undefined" &&
			window.localStorage &&
			typeof window.localStorage.getItem === "function"
				? window.localStorage
				: typeof localStorage !== "undefined" &&
					  typeof localStorage.getItem === "function"
					? localStorage
					: null;
		if (!storage) return;

		try {
			const savedChannel = storage.getItem(
				STORAGE_KEY_CHANNEL,
			) as SocialChannelType | null;
			if (
				savedChannel &&
				["grindr", "scruff", "jackd"].includes(savedChannel)
			) {
				this.activeChannel = savedChannel;
			}

			const savedAccounts = storage.getItem(STORAGE_KEY_ACCOUNTS);
			if (savedAccounts) {
				const parsed = JSON.parse(savedAccounts);
				if (parsed && typeof parsed === "object") {
					this.accounts.grindr = Array.isArray(parsed.grindr)
						? parsed.grindr
						: [];
					this.accounts.scruff = Array.isArray(parsed.scruff)
						? parsed.scruff
						: [];
					this.accounts.jackd = Array.isArray(parsed.jackd)
						? parsed.jackd
						: [];
				}
			}

			const savedActive = storage.getItem(STORAGE_KEY_ACTIVE_ACCOUNTS);
			if (savedActive) {
				const parsed = JSON.parse(savedActive);
				if (parsed && typeof parsed === "object") {
					this.activeAccountIds = {
						grindr: parsed.grindr ?? null,
						scruff: parsed.scruff ?? null,
						jackd: parsed.jackd ?? null,
					};
				}
			}
		} catch (e) {
			console.warn("Failed to load channel state from storage:", e);
		}
	}

	private saveToStorage() {
		const storage =
			typeof window !== "undefined" &&
			window.localStorage &&
			typeof window.localStorage.setItem === "function"
				? window.localStorage
				: typeof localStorage !== "undefined" &&
					  typeof localStorage.setItem === "function"
					? localStorage
					: null;
		if (!storage) return;

		try {
			storage.setItem(STORAGE_KEY_CHANNEL, this.activeChannel);
			storage.setItem(
				STORAGE_KEY_ACCOUNTS,
				JSON.stringify(this.accounts),
			);
			storage.setItem(
				STORAGE_KEY_ACTIVE_ACCOUNTS,
				JSON.stringify(this.activeAccountIds),
			);
		} catch (e) {
			console.warn("Failed to save channel state to storage:", e);
		}
	}
}

export const channelState = new ChannelState();

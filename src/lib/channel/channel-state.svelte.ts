import { SvelteMap } from "svelte/reactivity";

import {
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { getGeohashLocationLabel } from "./location-helper";
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
const STORAGE_KEY_GRINDR_GEOHASH = "og_grindr_last_geohash";

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
	grindrLastGeohash = $state<string | null>(null);
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
		if (this.activeChannel !== "grindr") {
			void this.checkAndSyncActiveAccount(this.activeChannel);
		}
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

		// 记录离开当前渠道时的定位点
		const currentGeohash = preferencesSnapshot().geohash;
		if (currentGeohash) {
			this.recordCurrentLocation(currentGeohash);
		}

		this.activeChannel = channel;
		this.saveToStorage();

		// 恢复目标渠道（及当前激活账号）绑定的最后一次定位点
		if (channel === "grindr") {
			if (this.grindrLastGeohash) {
				setPreferences({ geohash: this.grindrLastGeohash }).catch(
					() => {},
				);
			}
		} else {
			const acc = this.currentAccount;
			if (acc?.lastGeohash) {
				setPreferences({ geohash: acc.lastGeohash }).catch(() => {});
			} else if (acc && currentGeohash) {
				acc.lastGeohash = currentGeohash;
				acc.lastLocationName = getGeohashLocationLabel(currentGeohash);
				this.saveToStorage();
			}
			void this.checkAndSyncActiveAccount(channel);
		}
	}

	async checkAndSyncActiveAccount(
		channel: SocialChannelType = this.activeChannel,
	) {
		if (channel === "grindr") return;
		const accountId = this.activeAccountIds[channel];
		if (!accountId) return;
		const account = this.accounts[channel].find((a) => a.id === accountId);
		if (!account) return;

		const lastSynced =
			typeof account.extraMeta?.syncedAt === "number"
				? account.extraMeta.syncedAt
				: 0;
		const needsSync =
			!account.avatarUrl ||
			!account.name ||
			account.name === account.accountIdentifier ||
			!account.extraMeta?.profileId ||
			Date.now() - lastSynced > 3600000;

		if (!needsSync) return;

		const provider = this.getProvider(channel);
		if (!provider?.syncAccountProfile) return;

		try {
			const updated = await provider.syncAccountProfile(account);
			const list = this.accounts[channel];
			const idx = list.findIndex((a) => a.id === updated.id);
			if (idx >= 0) {
				list[idx] = updated;
				this.saveToStorage();
			}
		} catch (err) {
			console.warn(
				`[ChannelState] Failed to sync account profile for ${channel}:`,
				err,
			);
		}
	}

	recordCurrentLocation(geohash: string, locationName?: string) {
		if (!geohash) return;
		const label = locationName || getGeohashLocationLabel(geohash);

		if (this.activeChannel === "grindr") {
			this.grindrLastGeohash = geohash;
			this.saveToStorage();
		} else {
			const acc = this.currentAccount;
			if (acc) {
				acc.lastGeohash = geohash;
				acc.lastLocationName = label;
				this.saveToStorage();
			}
		}
	}

	addAccount(account: ChannelAccount) {
		const list = this.accounts[account.channel];
		const existingIndex = list.findIndex((a) => a.id === account.id);

		// 若新账号未指定定位点，默认继承当前定位
		if (!account.lastGeohash) {
			const currentGeohash = preferencesSnapshot().geohash;
			if (currentGeohash) {
				account.lastGeohash = currentGeohash;
				account.lastLocationName =
					getGeohashLocationLabel(currentGeohash);
			}
		}

		if (existingIndex >= 0) {
			list[existingIndex] = account;
		} else {
			list.push(account);
		}

		if (!this.activeAccountIds[account.channel]) {
			this.activeAccountIds[account.channel] = account.id;
		}

		this.saveToStorage();

		if (account.channel !== "grindr") {
			void this.checkAndSyncActiveAccount(account.channel);
		}
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

		if (accountId && channel !== "grindr") {
			const acc = this.accounts[channel].find((a) => a.id === accountId);
			if (acc) {
				if (acc.lastGeohash) {
					setPreferences({ geohash: acc.lastGeohash }).catch(
						() => {},
					);
				} else {
					const curr = preferencesSnapshot().geohash;
					if (curr) {
						acc.lastGeohash = curr;
						acc.lastLocationName = getGeohashLocationLabel(curr);
						this.saveToStorage();
					}
				}
			}
			void this.checkAndSyncActiveAccount(channel);
		}
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
				const parsed = JSON.parse(savedAccounts) as Record<
					string,
					unknown
				>;
				if (parsed && typeof parsed === "object") {
					this.accounts.grindr = Array.isArray(parsed.grindr)
						? (parsed.grindr as ChannelAccount[])
						: [];
					this.accounts.scruff = Array.isArray(parsed.scruff)
						? (parsed.scruff as ChannelAccount[])
						: [];
					this.accounts.jackd = Array.isArray(parsed.jackd)
						? (parsed.jackd as ChannelAccount[])
						: [];
				}
			}

			const savedActive = storage.getItem(STORAGE_KEY_ACTIVE_ACCOUNTS);
			if (savedActive) {
				const parsed = JSON.parse(savedActive) as Record<
					string,
					unknown
				>;
				if (parsed && typeof parsed === "object") {
					this.activeAccountIds = {
						grindr:
							typeof parsed.grindr === "string"
								? parsed.grindr
								: null,
						scruff:
							typeof parsed.scruff === "string"
								? parsed.scruff
								: null,
						jackd:
							typeof parsed.jackd === "string"
								? parsed.jackd
								: null,
					};
				}
			}
			const savedGrindrGeohash = storage.getItem(
				STORAGE_KEY_GRINDR_GEOHASH,
			);
			if (savedGrindrGeohash) {
				this.grindrLastGeohash = savedGrindrGeohash;
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
			if (this.grindrLastGeohash) {
				storage.setItem(
					STORAGE_KEY_GRINDR_GEOHASH,
					this.grindrLastGeohash,
				);
			}
		} catch (e) {
			console.warn("Failed to save channel state to storage:", e);
		}
	}
}

export const channelState = new ChannelState();

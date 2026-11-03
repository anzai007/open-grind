import type {
	SocialChannelType,
	UniversalPhoto,
	UniversalSocialLink,
	UniversalUserProfile,
} from "../types";
import {
	BODY_HAIR_LABELS,
	buildScruffPhotoUrl,
	COMMUNITY_LABELS,
	ETHNICITY_LABELS,
	RELATIONSHIP_STATUS_LABELS,
	SEX_PREFERENCE_LABELS,
	SOCIAL_SERVICES,
} from "./scruff-options";

export interface RawScruffProfile {
	id: number | string;
	name?: string;
	age?: number;
	about?: string;
	avatar_thumbnail_key?: string;
	avatar_fullsize_key?: string;
	profile_photos?: Array<{
		id?: string | number;
		thumbnail_key?: string;
		fullsize_key?: string;
	}>;
	distance?: number;
	logged_in?: boolean;
	last_active?: number | string;
	height?: number;
	weight_kg?: number;
	ethnicity?: number;
	body_hair?: number;
	sex_preferences?: number;
	relationship_status?: number;
	community?: number[];
	community_interests?: number[];
	hashtags?: string[];
	urls?: Array<{ service: number; url: string }>;
}

export function parseRawScruffProfile(
	p: RawScruffProfile,
	channel: SocialChannelType,
): UniversalUserProfile {
	const photos: UniversalPhoto[] = [];
	if (p.profile_photos && Array.isArray(p.profile_photos)) {
		for (const ph of p.profile_photos) {
			const thumb = buildScruffPhotoUrl(ph.thumbnail_key, "thumbnail");
			const full = buildScruffPhotoUrl(ph.fullsize_key, "fullsize");
			if (thumb || full) {
				photos.push({
					fullsizeUrl: full || thumb,
					id: String(ph.id || ph.thumbnail_key),
					thumbnailUrl: thumb,
				});
			}
		}
	}

	if (
		photos.length === 0 &&
		(p.avatar_thumbnail_key || p.avatar_fullsize_key)
	) {
		const thumb = buildScruffPhotoUrl(p.avatar_thumbnail_key, "thumbnail");
		const full = buildScruffPhotoUrl(
			p.avatar_fullsize_key || p.avatar_thumbnail_key,
			"fullsize",
		);
		photos.push({ fullsizeUrl: full, isAvatar: true, thumbnailUrl: thumb });
	}

	const socialLinks: UniversalSocialLink[] = [];
	if (p.urls && Array.isArray(p.urls)) {
		for (const u of p.urls) {
			const opt = SOCIAL_SERVICES[u.service];
			if (opt && u.url) {
				const clean = u.url.replace(/^@/, "");
				const href = /^https?:\/\//i.test(clean)
					? clean
					: `${opt.baseUrl}${encodeURIComponent(clean)}`;
				socialLinks.push({
					label: opt.label,
					service: opt.label.toLowerCase(),
					url: href,
				});
			}
		}
	}

	const communityTags: string[] = [];
	if (p.community && Array.isArray(p.community)) {
		for (const cId of p.community) {
			const label = COMMUNITY_LABELS[cId];
			if (label) communityTags.push(label);
		}
	}

	const ethnicity =
		p.ethnicity && ETHNICITY_LABELS[p.ethnicity]
			? ETHNICITY_LABELS[p.ethnicity]
			: undefined;
	const bodyHair =
		p.body_hair && BODY_HAIR_LABELS[p.body_hair]
			? BODY_HAIR_LABELS[p.body_hair]
			: undefined;
	const rolePreference =
		p.sex_preferences && SEX_PREFERENCE_LABELS[p.sex_preferences]
			? SEX_PREFERENCE_LABELS[p.sex_preferences]
			: undefined;
	const relationshipStatus =
		p.relationship_status &&
		RELATIONSHIP_STATUS_LABELS[p.relationship_status]
			? RELATIONSHIP_STATUS_LABELS[p.relationship_status]
			: undefined;

	const rawRecord = p as unknown as Record<string, unknown>;
	const rawHeight = p.height ?? rawRecord.heightCm ?? rawRecord.height_cm;
	let heightCm: number | undefined;
	if (rawHeight !== undefined && rawHeight !== null) {
		const numHeight =
			typeof rawHeight === "string"
				? parseFloat(rawHeight)
				: Number(rawHeight);
		if (!Number.isNaN(numHeight)) {
			const inCm = numHeight < 3 ? numHeight * 100 : numHeight;
			heightCm = Number(inCm.toFixed(1));
		}
	}

	const rawWeight = p.weight_kg ?? rawRecord.weight ?? rawRecord.weightKg;
	let weightKg: number | undefined;
	if (rawWeight !== undefined && rawWeight !== null) {
		const numWeight =
			typeof rawWeight === "string"
				? parseFloat(rawWeight)
				: Number(rawWeight);
		if (!Number.isNaN(numWeight)) {
			weightKg = Number(numWeight.toFixed(1));
		}
	}

	return {
		about: p.about || undefined,
		age: p.age,
		bodyHair,
		channel,
		communityTags,
		displayName: p.name || `User ${p.id}`,
		distanceMeters:
			p.distance !== undefined ? Math.round(p.distance * 1000) : null,
		distanceText:
			p.distance !== undefined
				? `${p.distance.toFixed(1)} km`
				: undefined,
		ethnicity,
		heightCm,
		id: String(p.id),
		isOnline: Boolean(p.logged_in),
		photos,
		rawPayload: p,
		relationshipStatus,
		rolePreference,
		socialLinks,
		weightKg,
	};
}

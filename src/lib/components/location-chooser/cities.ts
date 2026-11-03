import countriesRaw from "./countries.json";

export interface City {
	name: string;
	nameEn?: string;
	aliases?: string[];
	lat: number;
	lon: number;
	zoom?: number;
}

export interface Country {
	code: string;
	name: string;
	nameEn: string;
	aliases?: string[];
	flag: string;
	center: { lat: number; lon: number; zoom: number };
	cities: City[];
}

export const COUNTRIES: Country[] = countriesRaw;

export function getDistanceKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371; // 地球平均半径 (km)
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

export interface LocationInfo {
	country: string;
	city: string;
	flag?: string;
	coordsText: string;
	exactCoords: string;
	timezone?: string;
	lat: number;
	lon: number;
}

export const COUNTRY_TIMEZONES: Record<string, string> = {
	CN: "Asia/Shanghai",
	IN: "Asia/Kolkata",
	TH: "Asia/Bangkok",
	JP: "Asia/Tokyo",
	KR: "Asia/Seoul",
	SG: "Asia/Singapore",
	MY: "Asia/Kuala_Lumpur",
	VN: "Asia/Ho_Chi_Minh",
	PH: "Asia/Manila",
	ID: "Asia/Jakarta",
	KH: "Asia/Phnom_Penh",
	MM: "Asia/Yangon",
	NP: "Asia/Kathmandu",
	LK: "Asia/Colombo",
	PK: "Asia/Karachi",
	KZ: "Asia/Almaty",
	AE: "Asia/Dubai",
	SA: "Asia/Riyadh",
	TR: "Europe/Istanbul",
	IL: "Asia/Jerusalem",
	QA: "Asia/Qatar",
	GB: "Europe/London",
	FR: "Europe/Paris",
	DE: "Europe/Berlin",
	ES: "Europe/Madrid",
	IT: "Europe/Rome",
	NL: "Europe/Amsterdam",
	CH: "Europe/Zurich",
	AT: "Europe/Vienna",
	BE: "Europe/Brussels",
	PT: "Europe/Lisbon",
	GR: "Europe/Athens",
	SE: "Europe/Stockholm",
	NO: "Europe/Oslo",
	DK: "Europe/Copenhagen",
	FI: "Europe/Helsinki",
	PL: "Europe/Warsaw",
	CZ: "Europe/Prague",
	HU: "Europe/Budapest",
	IE: "Europe/Dublin",
	RU: "Europe/Moscow",
	US: "America/New_York",
	CA: "America/Toronto",
	MX: "America/Mexico_City",
	BR: "America/Sao_Paulo",
	AR: "America/Argentina/Buenos_Aires",
	CO: "America/Bogota",
	CL: "America/Santiago",
	AU: "Australia/Sydney",
	NZ: "Pacific/Auckland",
	ZA: "Africa/Johannesburg",
	EG: "Africa/Cairo",
	MA: "Africa/Casablanca",
};

export function resolveTimezone(
	countryCode: string,
	lat: number,
	lon: number,
	cityTimezone?: string,
): string {
	if (cityTimezone) return cityTimezone;

	if (countryCode === "US") {
		if (lon < -140) return "Pacific/Honolulu";
		if (lon < -114) return "America/Los_Angeles";
		if (lon < -100) return "America/Denver";
		if (lon < -85) return "America/Chicago";
		return "America/New_York";
	}
	if (countryCode === "CA") {
		if (lon < -114) return "America/Vancouver";
		if (lon < -100) return "America/Edmonton";
		return "America/Toronto";
	}
	if (countryCode === "AU") {
		if (lon < 129) return "Australia/Perth";
		if (lon < 140) return "Australia/Adelaide";
		return "Australia/Sydney";
	}
	if (countryCode === "ID" && lon > 114) return "Asia/Makassar";
	if (countryCode === "CN") {
		if (lat > 22 && lat < 23 && lon > 113.8 && lon < 114.5)
			return "Asia/Hong_Kong";
		if (lat > 21.8 && lat < 25.5 && lon > 119.8 && lon < 122.2)
			return "Asia/Taipei";
	}

	return COUNTRY_TIMEZONES[countryCode] ?? "UTC";
}

export function formatLocalTime(
	date: Date,
	timeZone?: string,
	lon?: number,
): string {
	if (timeZone) {
		try {
			const f = new Intl.DateTimeFormat("en-CA", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			});
			const parts = f.formatToParts(date);
			const year = parts.find((p) => p.type === "year")?.value;
			const month = parts.find((p) => p.type === "month")?.value;
			const day = parts.find((p) => p.type === "day")?.value;
			const hour = parts.find((p) => p.type === "hour")?.value;
			const minute = parts.find((p) => p.type === "minute")?.value;
			if (year && month && day && hour && minute) {
				return `${year}-${month}-${day} ${hour}:${minute}`;
			}
		} catch {
			// fallback below
		}
	}

	if (lon !== undefined && !isNaN(lon)) {
		const offsetHours = lon / 15;
		const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
		const targetMs = utcMs + offsetHours * 3600 * 1000;
		const d = new Date(targetMs);
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, "0");
		const day = String(d.getUTCDate()).padStart(2, "0");
		const h = String(d.getUTCHours()).padStart(2, "0");
		const min = String(d.getUTCMinutes()).padStart(2, "0");
		return `${y}-${m}-${day} ${h}:${min}`;
	}

	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day} ${h}:${min}`;
}

export function findLocationInfo(lat: number, lon: number): LocationInfo {
	const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
	const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
	const coordsText = `${latStr}, ${lonStr}`;
	const exactCoords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

	let bestMatch: {
		country: string;
		city: string;
		flag: string;
		countryCode: string;
		distKm: number;
	} | null = null;

	for (const country of COUNTRIES) {
		for (const city of country.cities) {
			const dist = getDistanceKm(lat, lon, city.lat, city.lon);
			if (!bestMatch || dist < bestMatch.distKm) {
				bestMatch = {
					country: country.name,
					city: city.name,
					flag: country.flag,
					countryCode: country.code,
					distKm: dist,
				};
			}
		}
	}

	if (bestMatch && bestMatch.distKm < 1500) {
		const timezone = resolveTimezone(bestMatch.countryCode, lat, lon);
		return {
			country: bestMatch.country,
			city: bestMatch.city,
			flag: bestMatch.flag,
			coordsText,
			exactCoords,
			timezone,
			lat,
			lon,
		};
	}

	return {
		country: "全球",
		city: "自选位置",
		coordsText,
		exactCoords,
		lat,
		lon,
	};
}

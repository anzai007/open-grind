export const INTEREST_TABS = [
	{ href: "/interest/views", label: "Views" },
	{ href: "/interest/taps", label: "Taps" },
];

export function getInterestTabs(channel: string = "grindr") {
	const secondTabLabel =
		channel === "scruff"
			? "Woof"
			: channel === "jackd"
				? "Wave"
				: channel === "heesay"
					? "SayHi"
					: "Taps";
	return [
		{ href: "/interest/views", label: "Views" },
		{ href: "/interest/taps", label: secondTabLabel },
	];
}

export function interestTabIndex(pathname: string): number {
	return Math.max(
		0,
		INTEREST_TABS.findIndex(({ href }) => href === pathname),
	);
}

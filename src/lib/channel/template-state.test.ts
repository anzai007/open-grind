import { describe, expect, it } from "vitest";

import { templateState } from "./template-state.svelte";

describe("TemplateState", () => {
	it("initializes default template groups and templates per channel", () => {
		expect(templateState.groups.length).toBeGreaterThan(0);
		expect(templateState.templates.length).toBeGreaterThan(0);

		const grindrGroup = templateState.getActiveGroup("grindr");
		expect(grindrGroup).toBeDefined();

		const scruffGroup = templateState.getActiveGroup("scruff");
		expect(scruffGroup).toBeDefined();

		const jackdGroup = templateState.getActiveGroup("jackd");
		expect(jackdGroup).toBeDefined();
	});

	it("returns a random template with name interpolation", () => {
		const res = templateState.getRandomTemplate("grindr", {
			displayName: "Alex",
		});
		expect(res).not.toBeNull();
		expect(typeof res!.text).toBe("string");
		expect(res!.template).toBeDefined();
	});

	it("supports switching active template group", () => {
		const groups = templateState.getGroups("grindr");
		if (groups.length > 1) {
			const targetGroup = groups[1]!;
			templateState.setActiveGroup("grindr", targetGroup.groupCode);
			expect(templateState.getActiveGroup("grindr")?.groupCode).toBe(
				targetGroup.groupCode,
			);
		}
	});

	it("supports adding and deleting custom templates", () => {
		const active = templateState.getActiveGroup("grindr");
		expect(active).toBeDefined();

		const newTpl = templateState.addTemplate({
			channel: "grindr",
			groupCode: active!.groupCode,
			groupName: active!.groupName,
			title: "Custom 1",
			content: "Hi {name}, nice profile!",
			enabled: true,
		});
		expect(newTpl).toBeDefined();
		expect(newTpl.content).toBe("Hi {name}, nice profile!");

		const templatesBefore = templateState.getTemplates(
			"grindr",
			active!.groupCode,
		);
		expect(templatesBefore.some((t) => t.id === newTpl.id)).toBe(true);

		templateState.deleteTemplate(newTpl.id);
		const templatesAfter = templateState.getTemplates(
			"grindr",
			active!.groupCode,
		);
		expect(templatesAfter.some((t) => t.id === newTpl.id)).toBe(false);
	});
});

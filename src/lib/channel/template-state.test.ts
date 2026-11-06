import { describe, expect, it } from "vitest";

import {
	DEFAULT_DIRECT_DM_TARGET_USER_IDS,
	templateState,
} from "./template-state.svelte";

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

	it("configures correct default target user IDs for channels", () => {
		expect(DEFAULT_DIRECT_DM_TARGET_USER_IDS.scruff).toBe("202040775");
		expect(DEFAULT_DIRECT_DM_TARGET_USER_IDS.heesay).toBe("111117647");
		expect(DEFAULT_DIRECT_DM_TARGET_USER_IDS.jackd).toBe("202279231");
	});

	it("manages openDirectDmDialog and default IDs properly", () => {
		templateState.openDirectDmDialog({ channel: "scruff" });
		expect(templateState.isDirectDmOpen).toBe(true);
		expect(templateState.directDmSelectedChannel).toBe("scruff");
		expect(templateState.directDmTargetUserId).toBe("202040775");

		templateState.openDirectDmDialog({ channel: "heesay" });
		expect(templateState.directDmSelectedChannel).toBe("heesay");
		expect(templateState.directDmTargetUserId).toBe("111117647");

		templateState.openDirectDmDialog({ channel: "jackd" });
		expect(templateState.directDmSelectedChannel).toBe("jackd");
		expect(templateState.directDmTargetUserId).toBe("202279231");

		templateState.openDirectDmDialog({ channel: "sub" });
		expect(templateState.directDmSelectedChannel).toBe("sub");
		expect(templateState.directDmTargetUserId).toBe("1063461581229215744");

		templateState.openDirectDmDialog({
			channel: "scruff",
			userId: "998877",
		});
		expect(templateState.directDmTargetUserId).toBe("998877");

		templateState.closeDirectDmDialog();
		expect(templateState.isDirectDmOpen).toBe(false);
	});

	it("interpolates variables properly in interpolateTemplate", () => {
		const out = templateState.interpolateTemplate(
			"Hi {name}, how is your day? - {display_name}",
			{ displayName: "David" },
		);
		expect(out).toBe("Hi David, how is your day? - David");

		const out2 = templateState.interpolateTemplate("Hello {{name}}!", {
			displayName: "User 12345",
		});
		expect(out2).toBe("Hello !");
	});

	it("validates empty target userId in sendQuickDm", async () => {
		const res = await templateState.sendQuickDm({
			id: "   ",
			displayName: "",
		});
		expect(res.success).toBe(false);
		expect(res.error).toBe("目标用户ID不能为空");
	});
});

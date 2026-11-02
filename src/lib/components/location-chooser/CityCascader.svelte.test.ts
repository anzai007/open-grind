// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import CityCascader from "./CityCascader.svelte";

describe("CityCascader", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders country and city dropdown triggers", () => {
		render(CityCascader, { onselect: vi.fn() });

		expect(screen.getByText("选择国家")).toBeTruthy();
		expect(screen.getByText("请先选国家")).toBeTruthy();
	});

	it("opens country list, selects a country, and auto-opens city dropdown", async () => {
		const onselect = vi.fn();
		render(CityCascader, { onselect });

		const countryTrigger = screen.getByText("选择国家").closest("button");
		expect(countryTrigger).toBeTruthy();
		await fireEvent.click(countryTrigger!);

		// Check if country options are displayed
		const chinaOption = screen.getByText("中国");
		expect(chinaOption).toBeTruthy();

		// Click China
		await fireEvent.click(chinaOption.closest("button")!);

		// onselect called with country center
		expect(onselect).toHaveBeenCalledWith(
			expect.objectContaining({
				isCity: false,
				lat: expect.any(Number),
				lon: expect.any(Number),
			}),
		);

		// City dropdown opens automatically with Chinese cities
		expect(screen.getByText("北京")).toBeTruthy();
		expect(screen.getByText("上海")).toBeTruthy();
	});

	it("selects a city and triggers onselect with city coordinates", async () => {
		const onselect = vi.fn();
		render(CityCascader, { onselect });

		// Open country dropdown and select China
		await fireEvent.click(screen.getByText("选择国家").closest("button")!);
		await fireEvent.click(screen.getByText("中国").closest("button")!);

		// Click Shanghai
		const shanghaiBtn = screen.getByText("上海").closest("button");
		expect(shanghaiBtn).toBeTruthy();
		await fireEvent.click(shanghaiBtn!);

		// Expect onselect called with Shanghai's coordinates and isCity: true
		expect(onselect).toHaveBeenLastCalledWith(
			expect.objectContaining({
				isCity: true,
				lat: 31.2304,
				lon: 121.4737,
				zoom: 12,
			}),
		);

		// City button shows selected city name
		expect(screen.getByText("上海")).toBeTruthy();
	});

	it("filters countries when typing in search input", async () => {
		render(CityCascader, { onselect: vi.fn() });

		await fireEvent.click(screen.getByText("选择国家").closest("button")!);

		const searchInput = screen.getByPlaceholderText(
			"搜索国家 (如: 中国 / US)...",
		);
		await fireEvent.input(searchInput, { target: { value: "日本" } });

		expect(screen.getByText("日本")).toBeTruthy();
		expect(screen.queryByText("法国")).toBeNull();
	});

	it("resets selection when clicking clear button", async () => {
		const onselect = vi.fn();
		render(CityCascader, { onselect });

		// Select country
		await fireEvent.click(screen.getByText("选择国家").closest("button")!);
		await fireEvent.click(screen.getByText("中国").closest("button")!);

		// Reset button should now be visible
		const resetBtn = screen.getByLabelText("重置位置选择");
		expect(resetBtn).toBeTruthy();
		await fireEvent.click(resetBtn);

		// Should reset to initial text
		expect(screen.getByText("选择国家")).toBeTruthy();
		expect(screen.getByText("请先选国家")).toBeTruthy();
	});

	it("searches and selects India and its core cities like Mumbai", async () => {
		const onselect = vi.fn();
		render(CityCascader, { onselect });

		// Open country dropdown
		await fireEvent.click(screen.getByText("选择国家").closest("button")!);

		// Search for India in Chinese
		const searchInput = screen.getByPlaceholderText(
			"搜索国家 (如: 中国 / US)...",
		);
		await fireEvent.input(searchInput, { target: { value: "印度" } });

		const indiaOption = screen.getByText("印度");
		expect(indiaOption).toBeTruthy();
		await fireEvent.click(indiaOption.closest("button")!);

		// Verify India is selected and country center is sent
		expect(onselect).toHaveBeenCalledWith(
			expect.objectContaining({
				isCity: false,
				lat: 20.5937,
				lon: 78.9629,
			}),
		);

		// City dropdown should list Mumbai / Delhi / Bengaluru
		expect(screen.getByText("孟买")).toBeTruthy();
		expect(screen.getByText("新德里 / 德里")).toBeTruthy();

		// Click Mumbai
		await fireEvent.click(screen.getByText("孟买").closest("button")!);

		expect(onselect).toHaveBeenLastCalledWith(
			expect.objectContaining({
				isCity: true,
				lat: 19.076,
				lon: 72.8777,
				zoom: 12,
			}),
		);
	});
});

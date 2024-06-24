import { cleanChangelogForNews } from "./tools";

describe("cleanChangelogForNews", () => {
	it("removes author names with umlauts", () => {
		const input = `
* (Jürgen) Line 1
* (Jérôme) Line 2
* (René) Line 3
* (Burić) Line 4
* (Çoban) Line 5
* (Jörg) Line 6
* (Keßler) Line 7
`.trim();

		const expected = `
Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
`.trim();

		expect(cleanChangelogForNews(input)).toBe(expected);
	});
});

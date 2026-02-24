import ky from "ky";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translateText } from "./translate.js";

// Mock ky
vi.mock("ky", () => {
	const post = vi.fn();
	return { default: { post } };
});
const mockedPost = vi.mocked(ky.post);

/** Helper to create a mock return value for ky.post().json() */
function mockJsonResponse(data: unknown) {
	return { json: () => Promise.resolve(data) } as ReturnType<typeof ky.post>;
}

/** Helper to create a mock rejected response for ky.post().json() */
function mockJsonRejection(error: Error) {
	return { json: () => Promise.reject(error) } as unknown as ReturnType<typeof ky.post>;
}

describe("translateText", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.DEEPL_API_KEY;
	});

	describe("with ioBroker translator (default behavior)", () => {
		it("should use ioBroker translator when no DeepL API key is provided", async () => {
			const mockData = {
				en: "Test message",
				de: "Testnachricht",
				fr: "Message de test",
			};
			mockedPost.mockReturnValueOnce(mockJsonResponse(mockData));

			const result = await translateText("Test message");

			expect(mockedPost).toHaveBeenCalledTimes(1);
			expect(mockedPost).toHaveBeenCalledWith(
				"https://translator.iobroker.in/translator",
				expect.objectContaining({
					body: expect.any(URLSearchParams),
					timeout: 120000,
				}),
			);

			// Verify the body params
			const body = mockedPost.mock.calls[0][1]!.body as URLSearchParams;
			expect(body.get("text")).toBe("Test message");
			expect(body.get("together")).toBe("true");

			expect(result).toEqual(mockData);
		});
	});

	describe("with DeepL API", () => {
		it("should use DeepL API when DEEPL_API_KEY is provided", async () => {
			process.env.DEEPL_API_KEY = "test-key:fx";

			// Mock DeepL responses for different languages
			const mockResponses = [
				{ translations: [{ text: "Testnachricht" }] }, // German
				{ translations: [{ text: "Mensaje de prueba" }] }, // Spanish
				{ translations: [{ text: "Message de test" }] }, // French
				{ translations: [{ text: "Messaggio di prova" }] }, // Italian
				{ translations: [{ text: "Testbericht" }] }, // Dutch
				{ translations: [{ text: "Wiadomość testowa" }] }, // Polish
				{ translations: [{ text: "Mensagem de teste" }] }, // Portuguese
				{ translations: [{ text: "Тестовое сообщение" }] }, // Russian
				{ translations: [{ text: "测试消息" }] }, // Chinese
			];

			mockedPost.mockImplementation(() => mockJsonResponse(mockResponses.shift()!));

			const result = await translateText("Test message");

			expect(mockedPost).toHaveBeenCalledTimes(9); // 9 target languages
			expect(mockedPost).toHaveBeenCalledWith(
				"https://api-free.deepl.com/v2/translate",
				expect.objectContaining({
					body: expect.any(URLSearchParams),
					timeout: 30000,
				}),
			);

			expect(result).toEqual({
				en: "Test message",
				de: "Testnachricht",
				es: "Mensaje de prueba",
				fr: "Message de test",
				it: "Messaggio di prova",
				nl: "Testbericht",
				pl: "Wiadomość testowa",
				pt: "Mensagem de teste",
				ru: "Тестовое сообщение",
				"zh-cn": "测试消息",
			});
		});

		it("should use pro API URL for non-free API keys", async () => {
			process.env.DEEPL_API_KEY = "test-key-pro";

			mockedPost.mockImplementation(() =>
				mockJsonResponse({ translations: [{ text: "Testnachricht" }] }),
			);

			await translateText("Test message");

			expect(mockedPost).toHaveBeenCalledWith(
				"https://api.deepl.com/v2/translate",
				expect.anything(),
			);
		});

		it("should continue with other languages if one translation fails", async () => {
			process.env.DEEPL_API_KEY = "test-key:fx";

			// Mock some successful and some failed responses
			let callCount = 0;
			mockedPost.mockImplementation(() => {
				callCount++;
				if (callCount === 2) {
					// Fail Spanish translation
					return mockJsonRejection(new Error("API error"));
				}
				return mockJsonResponse({
					translations: [{ text: `Translation ${callCount}` }],
				});
			});

			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
				// No-op
			});

			const result = await translateText("Test message");

			expect(result).toHaveProperty("en", "Test message");
			expect(result).toHaveProperty("de", "Translation 1");
			expect(result).not.toHaveProperty("es"); // Should be missing due to failure
			expect(result).toHaveProperty("fr", "Translation 3");

			expect(consoleSpy).toHaveBeenCalledWith("Failed to translate to es:", "API error");

			consoleSpy.mockRestore();
		});

		it("should fall back to ioBroker translator if DeepL completely fails", async () => {
			process.env.DEEPL_API_KEY = "invalid-key";

			// Mock ky.post to inspect URL and return appropriate response
			mockedPost.mockImplementation((url) => {
				const urlStr = String(url);
				if (urlStr.includes("deepl.com")) {
					// DeepL API calls should fail
					return mockJsonRejection(new Error("DeepL API error"));
				} else if (urlStr.includes("translator.iobroker.in")) {
					// ioBroker API should succeed
					return mockJsonResponse({
						en: "Test message",
						de: "Testnachricht (ioBroker)",
					});
				}
				return mockJsonRejection(new Error("Unexpected URL"));
			});

			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
				// No-op
			});
			const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
				// No-op
			});

			const result = await translateText("Test message");

			// Should have attempted DeepL first (1 call that failed), then called ioBroker (1 call)
			expect(mockedPost).toHaveBeenCalledTimes(2);

			// Verify ioBroker API was called
			expect(mockedPost).toHaveBeenCalledWith(
				"https://translator.iobroker.in/translator",
				expect.anything(),
			);

			expect(result).toEqual({
				en: "Test message",
				de: "Testnachricht (ioBroker)",
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				"DeepL translation failed, falling back to ioBroker translator:",
				"DeepL API error",
			);

			consoleSpy.mockRestore();
			consoleLogSpy.mockRestore();
		});
	});
});

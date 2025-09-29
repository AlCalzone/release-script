import axios from "axios";
import { translateText } from "./translate";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("translateText", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		delete process.env.DEEPL_API_KEY;
	});

	describe("with ioBroker translator (default behavior)", () => {
		it("should use ioBroker translator when no DeepL API key is provided", async () => {
			const mockResponse = {
				data: {
					en: "Test message",
					de: "Testnachricht",
					fr: "Message de test",
				},
			};
			mockedAxios.mockResolvedValueOnce(mockResponse);

			const result = await translateText("Test message");

			expect(mockedAxios).toHaveBeenCalledTimes(1);
			expect(mockedAxios).toHaveBeenCalledWith({
				method: "post",
				url: "https://translator.iobroker.in/translator",
				data: "text=Test%20message&together=true",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				},
			});
			expect(result).toEqual(mockResponse.data);
		});
	});

	describe("with DeepL API", () => {
		it("should use DeepL API when DEEPL_API_KEY is provided", async () => {
			process.env.DEEPL_API_KEY = "test-key:fx";

			// Mock DeepL responses for different languages
			const mockResponses = [
				{ data: { translations: [{ text: "Testnachricht" }] } }, // German
				{ data: { translations: [{ text: "Mensaje de prueba" }] } }, // Spanish
				{ data: { translations: [{ text: "Message de test" }] } }, // French
				{ data: { translations: [{ text: "Messaggio di prova" }] } }, // Italian
				{ data: { translations: [{ text: "Testbericht" }] } }, // Dutch
				{ data: { translations: [{ text: "Wiadomość testowa" }] } }, // Polish
				{ data: { translations: [{ text: "Mensagem de teste" }] } }, // Portuguese
				{ data: { translations: [{ text: "Тестовое сообщение" }] } }, // Russian
				{ data: { translations: [{ text: "测试消息" }] } }, // Chinese
			];

			mockedAxios.mockImplementation(() => Promise.resolve(mockResponses.shift()!));

			const result = await translateText("Test message");

			expect(mockedAxios).toHaveBeenCalledTimes(9); // 9 target languages
			expect(mockedAxios).toHaveBeenCalledWith({
				method: "post",
				url: "https://api-free.deepl.com/v2/translate",
				data: "text=Test%20message&source_lang=EN&target_lang=DE&auth_key=test-key%3Afx",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			});

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

			const mockResponse = { data: { translations: [{ text: "Testnachricht" }] } };
			mockedAxios.mockResolvedValue(mockResponse);

			await translateText("Test message");

			expect(mockedAxios).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.deepl.com/v2/translate",
				}),
			);
		});

		it("should continue with other languages if one translation fails", async () => {
			process.env.DEEPL_API_KEY = "test-key:fx";

			// Mock some successful and some failed responses
			let callCount = 0;
			mockedAxios.mockImplementation(() => {
				callCount++;
				if (callCount === 2) {
					// Fail Spanish translation
					return Promise.reject(new Error("API error"));
				}
				return Promise.resolve({
					data: { translations: [{ text: `Translation ${callCount}` }] },
				});
			});

			const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {
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

			// Mock the first DeepL call to fail (which will trigger fallback), then ioBroker to succeed
			mockedAxios.mockRejectedValueOnce(new Error("DeepL API error")).mockResolvedValueOnce({
				data: {
					en: "Test message",
					de: "Testnachricht (ioBroker)",
				},
			});

			const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {
				// No-op
			});
			const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {
				// No-op
			});

			const result = await translateText("Test message");

			// Should have attempted DeepL first (1 call that failed), then called ioBroker (1 call)
			expect(mockedAxios).toHaveBeenCalledTimes(2);
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

import ky from "ky";

const ioBrokerUrl = "https://translator.iobroker.in/translator";

// DeepL language mappings - from DeepL API codes to ioBroker expected codes
const deeplLanguageMap: Record<string, string> = {
	de: "de",
	es: "es",
	fr: "fr",
	it: "it",
	nl: "nl",
	pl: "pl",
	pt: "pt",
	ru: "ru",
	zh: "zh-cn",
};

/** Uses DeepL API to translate text into multiple languages */
async function translateWithDeepL(textEN: string, apiKey: string): Promise<Record<string, string>> {
	const translations: Record<string, string> = {
		en: textEN, // Always include the original English text
	};

	// Get base URL based on API key type (free vs pro)
	const baseUrl = apiKey.endsWith(":fx")
		? "https://api-free.deepl.com/v2/translate"
		: "https://api.deepl.com/v2/translate";

	// Test the API key with the first language first to fail fast if key is invalid
	const firstLanguage = Object.entries(deeplLanguageMap)[0];
	if (!firstLanguage) {
		throw new Error("No target languages configured for DeepL");
	}

	const [firstDeeplLang, firstIoBrokerLang] = firstLanguage;

	// First, test with one language to validate API key
	const response = await ky
		.post(baseUrl, {
			body: new URLSearchParams({
				text: textEN,
				source_lang: "EN",
				target_lang: firstDeeplLang.toUpperCase(),
				auth_key: apiKey,
			}),
		})
		.json<{ translations: Array<{ text: string }> }>();

	if (response.translations && response.translations.length > 0) {
		translations[firstIoBrokerLang] = response.translations[0].text;
	}

	// Now translate to remaining languages in parallel
	const remainingLanguages = Object.entries(deeplLanguageMap).slice(1);
	const translatePromises = remainingLanguages.map(async ([deeplLang, ioBrokerLang]) => {
		try {
			const resp = await ky
				.post(baseUrl, {
					body: new URLSearchParams({
						text: textEN,
						source_lang: "EN",
						target_lang: deeplLang.toUpperCase(),
						auth_key: apiKey,
					}),
				})
				.json<{ translations: Array<{ text: string }> }>();

			if (resp.translations && resp.translations.length > 0) {
				translations[ioBrokerLang] = resp.translations[0].text;
			}
		} catch (error) {
			// If translation fails for one language, continue with others
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Failed to translate to ${deeplLang}:`, message);
		}
	});

	// Wait for all remaining translations to complete
	await Promise.all(translatePromises);

	return translations;
}

/** Uses ioBroker translator service to translate text into multiple languages */
async function translateWithIoBroker(textEN: string): Promise<Record<string, string>> {
	return ky
		.post(ioBrokerUrl, {
			body: new URLSearchParams({
				text: textEN,
				together: "true",
			}),
		})
		.json();
}

/** Takes an english text and translates it into multiple languages */
export async function translateText(textEN: string): Promise<Record<string, string>> {
	const deeplApiKey = process.env.DEEPL_API_KEY;

	if (deeplApiKey) {
		try {
			console.log("Using DeepL API for translation");
			return await translateWithDeepL(textEN, deeplApiKey);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn("DeepL translation failed, falling back to ioBroker translator:", message);
			// Fall back to ioBroker translator if DeepL fails
		}
	}

	// Use ioBroker translator as default or fallback
	return await translateWithIoBroker(textEN);
}

const { GoogleGenAI } = require("@google/genai");

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in .env file");
  }

  return new GoogleGenAI({
    apiKey,
  });
};

const isQuotaErrorMessage = (message = "") => {
  const lowerMessage = String(message).toLowerCase();

  return (
    lowerMessage.includes("429") ||
    lowerMessage.includes("resource_exhausted") ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests")
  );
};

const extractJsonFromText = (text = "") => {
  let cleaned = String(text || "").trim();

  cleaned = cleaned
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
};

const generateGeminiText = async (prompt) => {
  try {
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    return {
      success: true,
      text: response.text || "No response generated.",
      provider: "gemini",
      errorType: null,
      errorMessage: null,
    };
  } catch (error) {
    console.error("Gemini Error:", error.message);

    const isQuotaError = isQuotaErrorMessage(error.message);

    return {
      success: false,
      text: "",
      provider: "gemini",
      errorType: isQuotaError ? "quota_exceeded" : "provider_error",
      errorMessage: isQuotaError
        ? "Gemini quota limit reached."
        : "Gemini is currently unavailable.",
    };
  }
};

const generateGeminiJson = async (prompt) => {
  try {
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const json = extractJsonFromText(text);

    return {
      success: true,
      json,
      rawText: text,
      provider: "gemini",
      errorType: null,
      errorMessage: null,
    };
  } catch (error) {
    console.error("Gemini JSON Error:", error.message);

    const isQuotaError = isQuotaErrorMessage(error.message);

    return {
      success: false,
      json: null,
      rawText: "",
      provider: "gemini",
      errorType: isQuotaError ? "quota_exceeded" : "provider_error",
      errorMessage: isQuotaError
        ? "Gemini quota limit reached. AI insights could not be generated."
        : "Gemini is currently unavailable. AI insights could not be generated.",
    };
  }
};

const streamGeminiText = async ({ prompt, onText }) => {
  try {
    const ai = getGeminiClient();

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    let fullText = "";

    for await (const chunk of stream) {
      const text = chunk.text || "";

      if (text) {
        fullText += text;
        onText(text);
      }
    }

    return {
      success: true,
      text: fullText || "No response generated.",
      provider: "gemini",
      errorType: null,
      errorMessage: null,
    };
  } catch (error) {
    console.error("Gemini Stream Error:", error.message);

    const isQuotaError = isQuotaErrorMessage(error.message);

    return {
      success: false,
      text: "",
      provider: "gemini",
      errorType: isQuotaError ? "quota_exceeded" : "provider_error",
      errorMessage: isQuotaError
        ? "Gemini quota limit reached."
        : "Gemini is currently unavailable.",
    };
  }
};

module.exports = {
  generateGeminiText,
  generateGeminiJson,
  streamGeminiText,
};

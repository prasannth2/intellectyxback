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

const generateGeminiText = async (prompt) => {
  try {
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    return response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini Error:", error.message);

    if (error.message?.includes("429")) {
      return "Gemini quota limit reached. Please try again later.";
    }

    return "AI assistant is currently unavailable. Please try again later.";
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

    return fullText || "No response generated.";
  } catch (error) {
    console.error("Gemini Stream Error:", error.message);

    const fallbackMessage = error.message?.includes("429")
      ? "Gemini quota limit reached. Please try again later."
      : "AI assistant is currently unavailable. Please try again later.";

    onText(fallbackMessage);

    return fallbackMessage;
  }
};

module.exports = {
  generateGeminiText,
  streamGeminiText,
};

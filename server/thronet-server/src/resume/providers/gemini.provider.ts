import { GoogleGenAI, Modality } from "@google/genai";
import { env } from "../config/env";
import { pcmToWav } from "../utils/audio";

const getAiClient = (): GoogleGenAI => {
  return new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY || process.env['RESUME_GEMINI_API_KEY'] || process.env['GEMINI_API_KEY'] || '',
  });
};

// ============================================================
// GENERATE TEXT
// ============================================================

export const generateContent = async (prompt: string): Promise<string> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt,
  });

  return response.text ?? "";
};

// ============================================================
// GENERATE JSON
// ============================================================

export const generateJSON = async <T>(prompt: string): Promise<T> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt,

    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8000,
      temperature: 0.1,
    },
  });

  const rawText = response.text?.trim() || "{}";

  const cleanJsonText = (text: string): string => {
    let cleaned = text.trim();

    // Remove markdown code fences if Gemini returns them.
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // If extra text exists around the JSON object,
    // keep only the outermost JSON object.
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    return cleaned;
  };

  const parseJson = (text: string): T => {
    const cleaned = cleanJsonText(text);

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Repair common trailing-comma issues.
      const repaired = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

      return JSON.parse(repaired) as T;
    }
  };

  try {
    return parseJson(rawText);
  } catch (error) {
    console.error("Gemini returned invalid JSON:", rawText);

    console.error("Gemini JSON parse error:", error);

    throw new Error("AI response could not be parsed. Please try again.");
  }
};

// ============================================================
// TEXT -> SPEECH (interview questions read aloud)
// ============================================================

export const generateSpeech = async (
  text: string,
): Promise<{ buffer: Buffer; mimeType: string }> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: env.GEMINI_TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: env.GEMINI_TTS_VOICE },
        },
      },
    },
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  );

  if (!audioPart?.inlineData?.data) {
    throw new Error("Gemini did not return any audio for this text.");
  }

  // Gemini returns raw 16-bit PCM @ 24kHz mono - wrap it as a playable WAV file.
  const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
  const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);

  return { buffer: wavBuffer, mimeType: "audio/wav" };
};

// ============================================================
// SPEECH -> TEXT (candidate's spoken answer)
// ============================================================

export const transcribeAudio = async (
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Transcribe the following spoken audio exactly as spoken, " +
              "word for word. Return ONLY the plain transcript text - no " +
              "labels, no quotation marks, no commentary, no formatting. " +
              "If the audio is silent or unintelligible, return an empty string.",
          },
          {
            inlineData: {
              mimeType,
              data: audioBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
  });

  return response.text?.trim() ?? "";
};

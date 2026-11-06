import { apiError } from "../errors";
import { invalidProviderResponse, providerObject, requestAiProvider } from "./aiProvider";
import type { Infer } from "convex/values";
import type { completedTranscription, transcriptWord } from "./validation";

const TRANSCRIPTS_URL = "https://api.assemblyai.com/v2/transcript";
export const ASSEMBLYAI_MODEL = "universal-2";
export type TranscriptWord = Infer<typeof transcriptWord>;
export type Transcription =
  | { id: string; status: "queued" | "processing" | "error" }
  | Infer<typeof completedTranscription>;

/** Submits an already-authorized S3 URL once; persist the ID before polling. */
export async function submitTranscription(apiKey: string, videoUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    throw apiError("invalid_state", { reason: "transcription_url_invalid" });
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw apiError("invalid_state", { reason: "transcription_url_invalid" });
  const data = await requestAiProvider("assemblyai", TRANSCRIPTS_URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: videoUrl,
      speech_models: [ASSEMBLYAI_MODEL],
      language_code: "en_us",
    }),
  });
  if (typeof data.id !== "string" || !data.id.trim())
    throw invalidProviderResponse("assemblyai", true);
  return data.id;
}

/** Reads one job without polling loops; terminal provider errors remain a redacted status. */
export async function getTranscription(apiKey: string, id: string): Promise<Transcription> {
  if (!id.trim()) throw apiError("invalid_state", { reason: "transcription_id_missing" });
  const data = await requestAiProvider(
    "assemblyai",
    `${TRANSCRIPTS_URL}/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: apiKey },
    },
  );
  if (data.id !== id) throw invalidProviderResponse("assemblyai");
  switch (data.status) {
    case "queued":
    case "processing":
    case "error":
      return { id, status: data.status };
    case "completed": {
      // AssemblyAI can return null text/words when the file contains no speech.
      const text = data.text === null ? "" : data.text;
      const words = data.words === null ? [] : data.words;
      if (
        typeof text !== "string" ||
        !Array.isArray(words) ||
        words.length > 8192 ||
        (text.trim() !== "" && words.length === 0) ||
        typeof data.audio_duration !== "number" ||
        !Number.isFinite(data.audio_duration) ||
        data.audio_duration < 0 ||
        typeof data.speech_model_used !== "string" ||
        !data.speech_model_used.trim()
      )
        throw invalidProviderResponse("assemblyai");
      return {
        id,
        status: "completed",
        text,
        words: words.map((value): TranscriptWord => {
          const word = providerObject(value, "assemblyai");
          if (
            typeof word.text !== "string" ||
            typeof word.start !== "number" ||
            !Number.isSafeInteger(word.start) ||
            word.start < 0 ||
            typeof word.end !== "number" ||
            !Number.isSafeInteger(word.end) ||
            word.end < word.start
          )
            throw invalidProviderResponse("assemblyai");
          return { text: word.text, startMs: word.start, endMs: word.end };
        }),
        durationSeconds: data.audio_duration,
        model: data.speech_model_used,
      };
    }
    default:
      throw invalidProviderResponse("assemblyai");
  }
}

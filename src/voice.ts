import OpenAI, { toFile } from "openai";
import type { Config } from "./config.js";

/**
 * Transcribe a voice message using OpenAI Whisper.
 * Accepts an OGG/Opus buffer (Telegram's voice format).
 */
export async function transcribeAudio(
  config: Config,
  audioBuffer: Buffer,
  filename: string = "voice.ogg"
): Promise<string> {
  const client = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: config.groqApiKey,
  });

  const file = await toFile(audioBuffer, filename, { type: "audio/ogg" });

  try {
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-large-v3-turbo",
      file,
      response_format: "text",
    });

    return (transcription as unknown as string).trim();
  } catch (err: unknown) {
    // Surface the real error from OpenAI
    if (err instanceof OpenAI.APIError) {
      console.error(`❌ Whisper API error [${err.status}]: ${err.message}`);
      throw new Error(`Whisper API error (${err.status}): ${err.message}`);
    }
    if (err instanceof OpenAI.APIConnectionError) {
      console.error(`❌ Whisper connection error: ${err.message}`);
      throw new Error(`Cannot reach OpenAI API: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns an audio buffer (MP3) or null if ElevenLabs is not configured.
 */
export async function textToSpeech(
  config: Config,
  text: string
): Promise<Buffer | null> {
  if (!config.elevenLabsApiKey) {
    return null;
  }

  // Truncate very long responses for TTS (ElevenLabs has limits)
  const maxTtsLength = 4000;
  const ttsText = text.length > maxTtsLength
    ? text.slice(0, maxTtsLength) + "... (truncated for voice)"
    : text;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": config.elevenLabsApiKey,
    },
    body: JSON.stringify({
      text: ttsText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ ElevenLabs TTS error (${response.status}): ${errorText}`);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download a file from Telegram's servers.
 */
export async function downloadTelegramFile(fileUrl: string): Promise<Buffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

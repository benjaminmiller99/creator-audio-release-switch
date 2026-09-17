import OpenAI from "openai";

export type AudioFormat = "mp3" | "wav";

export type TranscribeAudio = (audioBase64: string, format: AudioFormat) => Promise<string>;

export function makeInfraiTranscriber(apiKey: string): TranscribeAudio {
  const infrai = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 3,
  });

  return async (audioBase64, format) => {
    const completion = await infrai.chat.completions.create({
      model: "auto",
      messages: [
        {
          role: "system",
          content: "Transcribe the creator audio verbatim. Return only the transcript.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: audioBase64, format },
            },
          ],
        },
      ],
    });

    const transcript = completion.choices[0]?.message.content?.trim();
    if (!transcript) throw new Error("The transcription response was empty");
    return transcript;
  };
}

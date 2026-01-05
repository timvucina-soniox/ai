import { soniox } from '@ai-sdk/soniox';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const result = await transcribe({
    model: soniox.transcription('stt-async-v3'),
    audio: await readFile('data/galileo.mp3'),
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Tokens:', result.providerMetadata?.soniox?.tokens);
}

main().catch(console.error);

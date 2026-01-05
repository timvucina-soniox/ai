# AI SDK - Soniox Provider

The **[Soniox provider](https://ai-sdk.dev/providers/ai-sdk-providers/soniox)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the Soniox transcription API.

## Setup

The Soniox provider is available in the `@ai-sdk/soniox` module. You can install it with

```bash
npm i @ai-sdk/soniox
```

## Provider Instance

You can import the default provider instance `soniox` from `@ai-sdk/soniox`:

```ts
import { soniox } from '@ai-sdk/soniox';
```

## Example

```ts
import { soniox } from '@ai-sdk/soniox';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: soniox.transcription('stt-async-v3'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-core/data/galileo.mp3',
  ),
});
```

## Documentation

Please check out the **[Soniox provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/soniox)** for more information.

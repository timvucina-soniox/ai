# Soniox Provider Plan

## Inspect/align with existing providers
- Use `packages/assemblyai/src/assemblyai-transcription-model.ts` and `packages/revai/src/revai-transcription-model.ts` as async-job patterns.
- Follow provider-utils conventions from `contributing/providers.md`.

## Create new package `packages/soniox`
- Add `package.json` (version `0.0.0`), `README.md`, `CHANGELOG.md`, `tsconfig*.json`, `tsup.config.ts`, `turbo.json`, `vitest.node.config.js`, `vitest.edge.config.js`.
- Implement source files:
  - `packages/soniox/src/soniox-provider.ts`
    - `createSoniox` + default `soniox`
    - headers include `Authorization: Bearer <key>` and UA suffix `ai-sdk/soniox/${VERSION}`
  - `packages/soniox/src/soniox-transcription-model.ts`
    - async flow: upload (optional) → create transcription → poll status → fetch transcript
    - map `tokens` to `segments` using `start_ms/end_ms`
    - use `audio_duration_ms` for `durationInSeconds`
    - expose raw tokens via `providerMetadata.soniox.tokens`
    - allow `providerOptions.soniox.audioUrl` to skip upload
  - `packages/soniox/src/soniox-transcription-options.ts`
    - model id union (`stt-async-v3`) + provider options zod schema
  - `packages/soniox/src/soniox-api-types.ts`
    - request/response shapes for create, status, transcript
  - `packages/soniox/src/soniox-error.ts`
    - error handler parsing `status_code/error_type/message`
  - `packages/soniox/src/soniox-config.ts`, `packages/soniox/src/version.ts`, `packages/soniox/src/index.ts`

## Provider options (initial set)
- `audioUrl` (string) — if provided, skip upload and use `audio_url`
- `fileId` (string) — advanced: allow using existing Soniox file
- `languageHints` (string[])
- `enableLanguageIdentification` (boolean)
- `enableSpeakerDiarization` (boolean)
- `context` (string | object)
- `clientReferenceId` (string)
- `webhookUrl`, `webhookAuthHeaderName`, `webhookAuthHeaderValue`
- `translation` (object), optional if you want it now

## Documentation
- Add `content/providers/01-ai-sdk-providers/<next-number>-soniox.mdx`
  - Setup, provider instance, model usage, provider options
  - Note async nature and polling
- Follow layout from `content/providers/01-ai-sdk-providers/110-deepgram.mdx`.

## Examples
- Add `examples/ai-core/src/transcribe/soniox.ts`
  - Example with `audio: new URL(...)`
  - Example with local file
  - Example with `providerOptions.soniox.audioUrl`

## Changeset
- Add `.changeset/<name>.md` for `@ai-sdk/soniox` with `major`.

## Tests
- `packages/soniox/src/soniox-transcription-model.test.ts`
  - mock upload + create + poll + transcript with `@ai-sdk/test-server`
  - verify request headers, user-agent, and body mapping
  - verify text/segments/duration mapping
- Add a small fixture audio file if needed (like Deepgram’s `transcript-test.mp3`).

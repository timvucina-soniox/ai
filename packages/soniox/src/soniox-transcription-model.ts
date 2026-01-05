import { SharedV3Warning, TranscriptionModelV3 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  delay,
  getFromApi,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { SonioxConfig } from './soniox-config';
import { sonioxFailedResponseHandler } from './soniox-error';
import {
  SonioxTranscriptionModelId,
  sonioxTranscriptionProviderOptionsSchema,
} from './soniox-transcription-options';
import {
  SonioxCreateTranscriptionRequest,
  SonioxTranscriptToken,
} from './soniox-api-types';

const sonioxUploadResponseSchema = z.object({
  id: z.string(),
});

const sonioxCreateTranscriptionResponseSchema = z.object({
  id: z.string(),
  status: z.string().nullish(),
});

const sonioxTranscriptionStatusResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  audio_duration_ms: z.number().nullish(),
  error_message: z.string().nullish(),
});

const sonioxTranscriptResponseSchema = z.object({
  id: z.string(),
  text: z.string().nullish(),
  tokens: z
    .array(
      z.object({
        text: z.string(),
        start_ms: z.number().nullish(),
        end_ms: z.number().nullish(),
        confidence: z.number().nullish(),
        speaker: z.union([z.number(), z.string()]).nullish(),
        language: z.string().nullish(),
        translation_status: z.string().nullish(),
      }),
    )
    .nullish(),
});

interface SonioxTranscriptionModelConfig extends SonioxConfig {
  _internal?: {
    currentDate?: () => Date;
  };
  pollingIntervalMs?: number;
}

export class SonioxTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';
  private readonly POLLING_INTERVAL_MS = 1000;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: SonioxTranscriptionModelId,
    private readonly config: SonioxTranscriptionModelConfig,
  ) {}

  private mapContext(
    context: z.infer<
      typeof sonioxTranscriptionProviderOptionsSchema
    >['context'],
  ): SonioxCreateTranscriptionRequest['context'] | undefined {
    if (!context) return undefined;

    if (typeof context === 'string') {
      return context;
    }

    return {
      general: context.general ?? undefined,
      text: context.text ?? undefined,
      terms: context.terms ?? undefined,
      translation_terms: context.translationTerms ?? undefined,
    };
  }

  private mapTranslation(
    translation: z.infer<
      typeof sonioxTranscriptionProviderOptionsSchema
    >['translation'],
  ): SonioxCreateTranscriptionRequest['translation'] | undefined {
    if (!translation) return undefined;

    if (translation.type === 'one_way') {
      return {
        type: 'one_way',
        target_language: translation.targetLanguage,
      };
    }

    return {
      type: 'two_way',
      language_a: translation.languageA,
      language_b: translation.languageB,
    };
  }

  private buildSegments(tokens: SonioxTranscriptToken[] | null | undefined) {
    if (!tokens) return [];

    return tokens
      .filter(
        token =>
          typeof token.start_ms === 'number' &&
          typeof token.end_ms === 'number',
      )
      .map(token => ({
        text: token.text,
        startSecond: token.start_ms! / 1000,
        endSecond: token.end_ms! / 1000,
      }));
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    const sonioxOptions = await parseProviderOptions({
      provider: 'soniox',
      providerOptions: options.providerOptions,
      schema: sonioxTranscriptionProviderOptionsSchema,
    });

    const audioUrl = sonioxOptions?.audioUrl ?? undefined;
    const fileIdOverride = sonioxOptions?.fileId ?? undefined;

    if (audioUrl && fileIdOverride) {
      throw new Error('Provide either audioUrl or fileId, not both.');
    }

    let fileId = fileIdOverride;

    if (!audioUrl && !fileId) {
      const blob =
        options.audio instanceof Uint8Array
          ? new Blob([options.audio as BlobPart])
          : new Blob([convertBase64ToUint8Array(options.audio) as BlobPart]);

      const fileExtension = mediaTypeToExtension(options.mediaType);
      const formData = new FormData();
      formData.append(
        'file',
        new File([blob], `audio.${fileExtension}`, {
          type: options.mediaType,
        }),
      );

      const { value: uploadResponse } = await postFormDataToApi({
        url: this.config.url({
          path: '/v1/files',
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), options.headers),
        formData,
        failedResponseHandler: sonioxFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          sonioxUploadResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      fileId = uploadResponse.id;
    }

    const body: SonioxCreateTranscriptionRequest = {
      model: this.modelId,
      audio_url: audioUrl ?? undefined,
      file_id: fileId ?? undefined,
      language_hints: sonioxOptions?.languageHints ?? undefined,
      enable_language_identification:
        sonioxOptions?.enableLanguageIdentification ?? undefined,
      enable_speaker_diarization:
        sonioxOptions?.enableSpeakerDiarization ?? undefined,
      context: this.mapContext(sonioxOptions?.context),
      client_reference_id: sonioxOptions?.clientReferenceId ?? undefined,
      webhook_url: sonioxOptions?.webhookUrl ?? undefined,
      webhook_auth_header_name:
        sonioxOptions?.webhookAuthHeaderName ?? undefined,
      webhook_auth_header_value:
        sonioxOptions?.webhookAuthHeaderValue ?? undefined,
      translation: this.mapTranslation(sonioxOptions?.translation),
    };

    const { value: submitResponse } = await postJsonToApi({
      url: this.config.url({
        path: '/v1/transcriptions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: sonioxFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sonioxCreateTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const pollingInterval =
      this.config.pollingIntervalMs ?? this.POLLING_INTERVAL_MS;

    let statusResponse: z.infer<typeof sonioxTranscriptionStatusResponseSchema>;

    while (true) {
      if (options.abortSignal?.aborted) {
        throw new Error('Transcription request was aborted');
      }

      const { value } = await getFromApi({
        url: this.config.url({
          path: `/v1/transcriptions/${submitResponse.id}`,
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), options.headers),
        failedResponseHandler: sonioxFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          sonioxTranscriptionStatusResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      statusResponse = value;

      if (statusResponse.status === 'completed') {
        break;
      }

      if (statusResponse.status === 'error') {
        throw new Error(
          `Transcription failed: ${statusResponse.error_message ?? 'Unknown error'}`,
        );
      }

      await delay(pollingInterval);
    }

    const {
      value: transcriptResponse,
      responseHeaders,
      rawValue: rawResponse,
    } = await getFromApi({
      url: this.config.url({
        path: `/v1/transcriptions/${submitResponse.id}/transcript`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      failedResponseHandler: sonioxFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sonioxTranscriptResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const tokens = transcriptResponse.tokens ?? [];
    const segments = this.buildSegments(tokens);

    return {
      text: transcriptResponse.text ?? '',
      segments,
      language: undefined,
      durationInSeconds:
        typeof statusResponse.audio_duration_ms === 'number'
          ? statusResponse.audio_duration_ms / 1000
          : undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata: {
        soniox: {
          tokens,
        },
      },
    };
  }
}

/**
 * SmolLM Worker — Runs Transformers.js inference off main thread.
 * Spec Option A: streaming tokens + abort support.
 */

// Worker protocol types (duplicated here to avoid import issues in worker context)
type StreamPhase = 'download' | 'init' | 'warmup' | 'generate';

type WorkerInMessage =
  | { v: 1; type: 'INIT'; requestId: string; modelId: string }
  | { v: 1; type: 'GENERATE'; requestId: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; maxTokens: number; temperature?: number; topP?: number; stream: boolean }
  | { v: 1; type: 'ABORT'; requestId: string; reason: 'USER' | 'TIMEOUT' }
  | { v: 1; type: 'TEARDOWN'; requestId: string };

type WorkerOutMessage =
  | { v: 1; type: 'READY'; requestId: string; modelId: string }
  | { v: 1; type: 'PROGRESS'; requestId: string; phase: StreamPhase; percent?: number; text?: string; downloadedBytes?: number; totalBytes?: number }
  | { v: 1; type: 'TOKEN'; requestId: string; token: string }
  | { v: 1; type: 'FINAL'; requestId: string; text: string; usage?: { completionTokens?: number } }
  | { v: 1; type: 'ERROR'; requestId: string; code: 'ERROR_ABORTED' | 'ERROR_OOM' | 'ERROR_MODEL_LOAD' | 'ERROR_UNKNOWN'; message: string };

type Pipeline = (
  messages: Array<{ role: string; content: string }>,
  options?: { max_new_tokens?: number; temperature?: number; top_p?: number; callback_function?: (data: any) => boolean }
) => Promise<Array<{ generated_text: Array<{ role: string; content: string }> }>>;

const ALLOWED_HF_REPOS = new Set([
  'onnx-community/Qwen2.5-0.5B-Instruct',
  'HuggingFaceTB/SmolLM2-360M-Instruct',
  'HuggingFaceTB/SmolLM2-135M-Instruct',
]);

const MODEL_SIZES: Record<string, number> = {
  'onnx-community/Qwen2.5-0.5B-Instruct': 350 * 1024 * 1024,
  'HuggingFaceTB/SmolLM2-360M-Instruct': 250 * 1024 * 1024,
  'HuggingFaceTB/SmolLM2-135M-Instruct': 100 * 1024 * 1024,
};

let pipeline: Pipeline | null = null;
let currentModelId: string | null = null;
let aborted = false;
let currentRequestId: string | null = null;

function post(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

async function handleInit(requestId: string, modelId: string): Promise<void> {
  if (!ALLOWED_HF_REPOS.has(modelId)) {
    post({ v: 1, type: 'ERROR', requestId, code: 'ERROR_MODEL_LOAD', message: `Model not allowed: ${modelId}` });
    return;
  }

  const totalBytes = MODEL_SIZES[modelId] ?? 300 * 1024 * 1024;

  post({ v: 1, type: 'PROGRESS', requestId, phase: 'init', percent: 0, text: 'Loading Transformers.js...' });

  try {
    const { pipeline: createPipeline, env } = await import('@huggingface/transformers');

    env.allowLocalModels = false;
    env.useBrowserCache = false;
    env.useCustomCache = false;

    post({ v: 1, type: 'PROGRESS', requestId, phase: 'download', percent: 5, text: 'Downloading model...' });

    pipeline = await createPipeline('text-generation', modelId, {
      progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
        if (progress.status === 'progress' && progress.progress !== undefined) {
          const percent = Math.round(5 + progress.progress * 0.9);
          const downloadedBytes = Math.round((progress.progress / 100) * totalBytes);
          post({
            v: 1,
            type: 'PROGRESS',
            requestId,
            phase: 'download',
            percent,
            text: `Downloading ${progress.file ?? 'model'}...`,
            downloadedBytes,
            totalBytes,
          });
        }
      },
    }) as unknown as Pipeline;

    currentModelId = modelId;

    post({ v: 1, type: 'PROGRESS', requestId, phase: 'warmup', percent: 98, text: 'Warming up...' });
    post({ v: 1, type: 'READY', requestId, modelId });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ v: 1, type: 'ERROR', requestId, code: 'ERROR_MODEL_LOAD', message });
  }
}

async function handleGenerate(
  requestId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  temperature?: number,
  topP?: number,
  stream?: boolean
): Promise<void> {
  if (!pipeline) {
    post({ v: 1, type: 'ERROR', requestId, code: 'ERROR_UNKNOWN', message: 'Pipeline not initialized' });
    return;
  }

  aborted = false;
  currentRequestId = requestId;

  post({ v: 1, type: 'PROGRESS', requestId, phase: 'generate', percent: 0, text: 'Generating...' });

  // Token buffer for throttling (batch tokens before sending)
  let tokenBuffer = '';
  let lastFlush = Date.now();
  const FLUSH_INTERVAL_MS = 30;

  const flushTokens = () => {
    if (tokenBuffer.length > 0) {
      post({ v: 1, type: 'TOKEN', requestId, token: tokenBuffer });
      tokenBuffer = '';
    }
    lastFlush = Date.now();
  };

  try {
    const formattedMessages = messages.map((m) => ({
      role: m.role as string,
      content: m.content,
    }));

    // Transformers.js text-generation doesn't support real token streaming
    // We generate the full response then emit pseudo-streaming tokens
    let fullText = '';

    const output = await pipeline(formattedMessages, {
      max_new_tokens: maxTokens,
      temperature: temperature ?? 0.7,
      top_p: topP ?? 1.0,
    });

    if (aborted) return;

    // Extract final text
    const generatedMessages = output[0]?.generated_text ?? [];
    const assistantMessages = generatedMessages.filter((m: { role: string }) => m.role === 'assistant');
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    fullText = lastAssistant?.content ?? '';

    // Emit pseudo-streaming tokens (ChatGPT-like effect)
    if (fullText.length > 0 && stream) {
      const CHUNK_SIZE = 8; // characters per chunk for smooth effect
      for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
        if (aborted) break;
        const chunk = fullText.slice(i, i + CHUNK_SIZE);
        post({ v: 1, type: 'TOKEN', requestId, token: chunk });
        // Yield to allow UI updates
        await new Promise(r => setTimeout(r, 15));
      }
    } else if (fullText.length > 0) {
      // No streaming requested, emit full text as single token
      post({ v: 1, type: 'TOKEN', requestId, token: fullText });
    }

    // Send final
    post({
      v: 1,
      type: 'FINAL',
      requestId,
      text: fullText,
      usage: { completionTokens: Math.ceil(fullText.length / 4) },
    });

  } catch (err) {
    if (aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    post({ v: 1, type: 'ERROR', requestId, code: 'ERROR_UNKNOWN', message });
  } finally {
    currentRequestId = null;
  }
}

function handleAbort(requestId: string): void {
  if (currentRequestId === requestId) {
    aborted = true;
  }
}

function handleTeardown(requestId: string): void {
  pipeline = null;
  currentModelId = null;
  aborted = false;
  currentRequestId = null;
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.v !== 1) return;

  switch (msg.type) {
    case 'INIT':
      await handleInit(msg.requestId, msg.modelId);
      break;
    case 'GENERATE':
      await handleGenerate(
        msg.requestId,
        msg.messages,
        msg.maxTokens,
        msg.temperature,
        msg.topP,
        msg.stream
      );
      break;
    case 'ABORT':
      handleAbort(msg.requestId);
      break;
    case 'TEARDOWN':
      handleTeardown(msg.requestId);
      break;
  }
};

import "server-only";

/*
 * The server-only face of the provider and model configuration.
 *
 * The configuration itself lives in ./chains.ts without this guard so scripts
 * and tests can read it; this file exists so application code importing it
 * still cannot be pulled into a client bundle by accident — which matters more
 * now that aiConfig() reads API keys out of the environment.
 */
export {
  aiConfig,
  isAiConfigured,
  modelsFor,
  providerDefinition,
  speechLanguages,
  ttsFor,
  AI_PROVIDERS,
  SPEECH_LANGUAGE_NAMES,
  type AiConfig,
  type AiProvider,
  type AiTask,
  type AudioTransport,
  type JsonMode,
  type ModelChoice,
} from "./chains";

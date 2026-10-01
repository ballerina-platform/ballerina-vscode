import ballerinax/ai.openai;

configurable string apiKey = ?;

const DEFAULT_MODEL = "gpt-4o";

final openai:ModelProvider enumModel = check new (apiKey, openai:GPT_4O_MINI);

final openai:ModelProvider literalModel = check new (apiKey, "gpt-4o-mini-2024-07-18");

final openai:ModelProvider userConstModel = check new (apiKey, DEFAULT_MODEL);

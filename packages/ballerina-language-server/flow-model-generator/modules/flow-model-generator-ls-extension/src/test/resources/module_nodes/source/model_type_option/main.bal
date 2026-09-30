import ballerinax/ai.openai;

configurable string apiKey = ?;

final openai:ModelProvider enumModel = check new (apiKey, openai:GPT_4O_MINI);

final openai:ModelProvider literalModel = check new (apiKey, "gpt-4o-mini-2024-07-18");

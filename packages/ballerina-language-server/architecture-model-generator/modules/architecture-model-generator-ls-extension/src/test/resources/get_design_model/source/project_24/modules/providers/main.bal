import ballerinax/ai.openai;

configurable string apiKey = ?;

// Keeps the declaration past the end of the default module's main.bal.
// Keeps the declaration past the end of the default module's main.bal.

public final openai:ModelProvider model = check new (apiKey, openai:GPT_4O_MINI);

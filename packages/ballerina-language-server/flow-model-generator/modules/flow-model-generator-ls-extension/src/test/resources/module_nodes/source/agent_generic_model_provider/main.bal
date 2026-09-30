import ballerina/ai;
import ballerinax/ai.openai;

configurable string apiKey = ?;

final ai:ModelProvider newsAgentModel = check new openai:ModelProvider(
    apiKey, openai:GPT_4O_MINI, serviceUrl = "https://openrouter.ai/api/v1");

final ai:Agent newsAgent = check new (
    systemPrompt = {role: "Hacker News Assistant", instructions: "Summarize the latest headlines."},
    model = newsAgentModel, memory = newsAgentMemory, tools = []
);

final ai:ShortTermMemoryStore newsAgentMemoryStore = check new ai:InMemoryShortTermMemoryStore();
final ai:ShortTermMemory newsAgentMemory = check new (newsAgentMemoryStore);

final ai:ModelProvider literalModel = check new openai:ModelProvider(apiKey, "gpt-4o-mini-2024-07-18");

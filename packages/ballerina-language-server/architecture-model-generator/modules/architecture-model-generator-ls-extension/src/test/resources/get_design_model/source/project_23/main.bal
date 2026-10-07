import ballerina/ai;

final ai:Wso2ModelProvider model = check ai:getDefaultModelProvider();
final ai:ShortTermMemoryStore store = check new ai:InMemoryShortTermMemoryStore();

final ai:Memory genericMemory = check new ai:ShortTermMemory(store);
final ai:ShortTermMemory concreteExplicitMemory = check new ai:ShortTermMemory(store);
final ai:ShortTermMemory concreteImplicitMemory = check new (store);

final ai:Agent genericAgent = check new (systemPrompt = {role: "a", instructions: "b"}, model = model,
    memory = genericMemory, tools = []);
final ai:Agent concreteExplicitAgent = check new (systemPrompt = {role: "a", instructions: "b"}, model = model,
    memory = concreteExplicitMemory, tools = []);
final ai:Agent concreteImplicitAgent = check new (systemPrompt = {role: "a", instructions: "b"}, model = model,
    memory = concreteImplicitMemory, tools = []);

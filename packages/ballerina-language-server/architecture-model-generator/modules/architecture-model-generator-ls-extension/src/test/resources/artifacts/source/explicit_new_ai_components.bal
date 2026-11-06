import ballerina/ai;

final ai:ModelProvider modelProvider = check new ai:Wso2ModelProvider("https://example.com/chat", "token");
final ai:EmbeddingProvider embeddingProvider = check new ai:Wso2EmbeddingProvider("https://example.com/embeddings", "token");
final ai:VectorStore vectorStore = check new ai:InMemoryVectorStore();
final ai:KnowledgeBase knowledgeBase = new ai:VectorKnowledgeBase(vectorStore, embeddingProvider);

import ballerina/ai;

final ai:Wso2EmbeddingProvider embeddingProvider = check new ("https://example.com/embeddings", "token");
final ai:InMemoryVectorStore vectorStore = check new;
final ai:VectorKnowledgeBase knowledgeBase = new (vectorStore, embeddingProvider);

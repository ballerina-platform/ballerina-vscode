import ballerina/ai;

final ai:InMemoryVectorStore vectorStore = check new;
final ai:Wso2EmbeddingProvider embeddingProvider = check new ("https://example.com/embeddings", "token");
final ai:VectorKnowledgeBase knowledgeBase = new (vectorStore, embeddingProvider);

function ingest(string path) returns error? {
    ai:TextDataLoader loader = check new (path);
    ai:Document|ai:Document[] documents = check loader.load();
    check knowledgeBase.ingest(documents);
}

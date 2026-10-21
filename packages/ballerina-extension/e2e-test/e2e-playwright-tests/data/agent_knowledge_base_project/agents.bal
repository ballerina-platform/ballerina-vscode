import ballerina/ai;

// A knowledge base the agent can be given a retrieval tool for. In memory and backed by the
// default embedding provider so the project needs no external service to open or build.
final ai:InMemoryVectorStore handbookStore = check new ();

final ai:Wso2EmbeddingProvider handbookEmbedding = check ai:getDefaultEmbeddingProvider();

final ai:VectorKnowledgeBase handbookKnowledgeBase = new (handbookStore, handbookEmbedding);

final ai:Agent librarianAgent = check new (
    systemPrompt = {
        role: string `Librarian`,
        instructions: string `Answer from the knowledge base and say so when it has no answer.`
    }, model = check ai:getDefaultModelProvider()
);

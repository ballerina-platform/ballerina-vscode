import ballerina/ai;
import ballerina/http;
import ballerina/workflow;

final ai:Wso2ModelProvider claimModel = check new ("http://localhost:9099", "test-token");

final http:Client claimApi = check new ("http://localhost:9090");

# Fetch claim details activity
@workflow:Activity
function fetchClaim(http:Client api, string claimId) returns json|error {
    return api->get("/claims/" + claimId);
}

# Expense claim durable agentic workflow
final workflow:DurableAgent claimAgent = check new ({
    systemPrompt: {role: "Expense claim assistant", instructions: "Process expense claims."},
    model: claimModel,
    activities: [
        myActivity
    ]
});

# Search the claims knowledge base
@ai:AgentTool
isolated function searchClaimDocs(string query) returns string|error {
    return "results for " + query;
}

final ai:McpToolKit claimMcp = check new ("http://localhost:9092/mcp");

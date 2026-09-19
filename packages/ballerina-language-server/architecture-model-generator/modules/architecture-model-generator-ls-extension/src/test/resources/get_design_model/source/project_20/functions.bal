import ballerina/ai;
import ballerina/http;
import ballerina/workflow;

final http:Client notifications = check new ("http://localhost:9092");

@workflow:Activity
function fileClaim(decimal amount, string description) returns string|error {
    return string `CLM-${amount}`;
}

@workflow:Activity
function validateClaim(string claimId, decimal amount) returns string|error {
    return claimId;
}

@workflow:Activity
function notifyUser(string username, string title, string body) returns string|error {
    json posted = check notifications->post("/notifications", {user: username, title, body});
    return posted.toJsonString();
}

@workflow:Activity
function executePayment(string claimId, decimal payout) returns string|error {
    return "PAY-" + claimId;
}

# Asks the stock desk whether an item is available.
# + item - the item name
# + return - the stock desk's answer
@ai:AgentTool
isolated function askStock(string item) returns string|error {
    return stockAgent.run(string `Is ${item} in stock?`);
}

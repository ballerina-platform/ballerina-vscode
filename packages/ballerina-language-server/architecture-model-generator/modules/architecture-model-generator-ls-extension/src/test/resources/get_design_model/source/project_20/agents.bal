import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider claimModel = check new ("http://localhost:9099", "test-token");

final ai:Agent stockAgent = check new (
    systemPrompt = {role: "Stock desk", instructions: "Answer whether an item is in stock."},
    model = claimModel
);

final workflow:DurableAgent paymentAgent = check new ({
    systemPrompt: {role: "Payment desk", instructions: "Release payments."},
    model: claimModel,
    activities: [executePayment],
    humanTasks: {
        release: {userRoles: "FINANCE", resultType: string, title: "Release payment"}
    }
});

final workflow:DurableAgent claimAgent = check new ({
    systemPrompt: {role: "Smart Claim assistant", instructions: "Run one claim case end to end."},
    model: claimModel,
    maxIter: 24,
    activities: [
        fileClaim,
        {activity: validateClaim, description: "Apply the pre-approval rules."},
        notifyUser,
        {activity: executePayment, requiresApproval: true, userRoles: "ACCOUNTANT",
            description: "Release the payment. Gated on an accountant."}
    ],
    tools: [askStock],
    events: {chat: {request: string, response: string, cardinality: workflow:MULTI_EVENT}},
    humanTasks: {
        managerApproval: {userRoles: ["MANAGER", "DIRECTOR"], resultType: string, title: "Manager sign-off"}
    },
    peers: [{agent: paymentAgent, name: "pay", requiresApproval: true, userRoles: "FINANCE"}]
});

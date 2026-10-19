import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider wso2ModelProvider = check ai:getDefaultModelProvider();

final workflow:DurableAgent claimAgent = check new ({
    systemPrompt: {
        role: string `Expense claim assistant`,
        instructions: string `Process expense claims end to end. Validate each claim with validateClaim first and reject invalid claims with a clear reason. When a claim is valid, pay it with payClaim using the claimed amount. Finish with a one-line summary of the outcome.`
    },
    model: wso2ModelProvider,
    inputType: ExpenseClaim,
    activities: [validateClaim],
    events: {chat: {request: string, response: string}}
});

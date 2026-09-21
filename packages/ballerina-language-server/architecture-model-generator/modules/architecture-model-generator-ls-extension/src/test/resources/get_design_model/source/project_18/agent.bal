import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider deskModel = check new ("http://localhost:9099", "test-token");

# A durable agent declaring its channels and tasks in the keyed form the module documents.
final workflow:DurableAgent deskAgent = check new ({
    systemPrompt: {role: "Desk", instructions: "Help the customer."},
    model: deskModel,
    events: {
        customerMessage: {request: string, response: string},
        billSubmitted: {request: string}
    },
    humanTasks: {
        escalation: {userRoles: "support-lead", title: "Escalated case"},
        signoff: {userRoles: "manager"},
        audit: auditTask
    }
});

# A task whose configuration is shared rather than written inline: the key still names it.
final workflow:HumanTaskDefinition auditTask = {userRoles: "auditor"};

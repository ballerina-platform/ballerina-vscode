import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider keyedModel = check new ("http://localhost:9099", "test-token");

# Agent declared in the 1.0 keyed form: `chat` declares a response, `bill` does not.
final workflow:DurableAgent keyedAgent = check new ({
    systemPrompt: {role: "Support", instructions: "Help."},
    model: keyedModel,
    events: {
        chat: {request: string, response: string},
        bill: {request: json}
    },
    humanTasks: {
        approve: {userRoles: "MANAGER"}
    }
});

function sendToKeyedAgent(string instanceId) returns error? {

}

final workflow:EventConfig noticeConfig = {request: json, response: string};

# A channel configured through a reference: whether it answers is not readable from the declaration.
final workflow:DurableAgent refAgent = check new ({
    systemPrompt: {role: "Notices", instructions: "Relay notices."},
    model: keyedModel,
    events: {notice: noticeConfig}
});

# A project on a keyed release whose agent still carries empty lists: the first entry rewrites them as maps.
final workflow:DurableAgent emptyAgent = check new ({
    systemPrompt: {role: "Inbox", instructions: "Route mail."},
    model: keyedModel,
    events: [],
    humanTasks: []
});

# A listed event that carries a comment: the designer cannot rewrite it without losing the comment.
final workflow:DurableAgent commentedAgent = check new ({
    systemPrompt: {role: "Notes", instructions: "Keep notes."},
    model: keyedModel,
    events: [
        {name: "note", request: json // the note body
        }
    ]
});

final workflow:EventConfig sharedEvent = {request: json};

const string EVENT_NAME = "ticket";

# Listed events the designer cannot rewrite as keys: a reference item, and a name that is a constant.
final workflow:DurableAgent refItemAgent = check new ({
    systemPrompt: {role: "Shared", instructions: "Share."},
    model: keyedModel,
    events: [sharedEvent]
});

final workflow:DurableAgent constNameAgent = check new ({
    systemPrompt: {role: "Tickets", instructions: "Track tickets."},
    model: keyedModel,
    events: [{name: EVENT_NAME, request: json}]
});

# A listed task whose texts carry their own spacing: a conversion must keep them as written.
final workflow:DurableAgent spacedAgent = check new ({
    systemPrompt: {role: "Bills", instructions: "Review bills."},
    model: keyedModel,
    humanTasks: [
        {name: "review", userRoles: "FINANCE", title: "Approve  the bill", description: string `Check the total.
    Approve if under 100.`}
    ]
});

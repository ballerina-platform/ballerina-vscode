import ballerina/ai;
import ballerina/http;
import ballerina/workflow;

final ai:Wso2ModelProvider deskModel = check new ("http://localhost:9099", "test-token");

final http:Client deskApi = check new ("http://localhost:9090");

final workflow:DurableAgent hotelAgent = check new ({
    systemPrompt: {role: "Hotel desk", instructions: "Research hotels."},
    model: deskModel
});

# Look up a booking activity
@workflow:Activity
function lookupBooking(http:Client api, string bookingId) returns json|error {
    return api->get("/bookings/" + bookingId);
}

final workflow:DurableAgent travelAgent = check new ({
    systemPrompt: {role: "Travel assistant", instructions: "Plan trips end to end."},
    model: deskModel,
    inputType: map<json>,
    activities: [
        {activity: lookupBooking, requiresApproval: true, retryPolicy: {maxRetries: 2, retryDelay: 1.5}, bindings: {api: deskApi}}
    ],
    events: [
        {name: "hotelResults", request: json, response: string}
    ],
    humanTasks: [
        {name: "approveItinerary", roles: "travel-lead", title: "Approve the itinerary"}
    ],
    peers: [
        {agent: hotelAgent, name: "askHotelDesk", description: "Hotel research", 'wait: false, callbackChannel: "hotelResults", requiresApproval: true, userRoles: "travel-lead"}
    ]
});

function driveTravelAgent() returns error? {
    string instanceId = check travelAgent.run(query = "Plan a 3-day trip", input = {city: "Kandy"});
    string token = check travelAgent.sendData(instanceId = instanceId, eventName = "hotelResults", data = {ok: true});
    string answer = check travelAgent.waitForDataResult(instanceId = instanceId, token = token);
}

@workflow:Workflow
function bookingFlow(workflow:Context ctx, string bookingId) returns json|error {
    json booking = check ctx->callActivity(activityFunction = lookupBooking, args = {api: deskApi, bookingId: bookingId});
    return booking;
}

final workflow:HumanReview opsNoRetryReviewers = "ops";

@workflow:Workflow
function childFlow(workflow:Context ctx, string id) returns error? {
}

@workflow:Workflow
function reconcileFlow(workflow:Context ctx, string billId) returns error? {
    json bill = check ctx->callActivity(lookupBooking, {api: deskApi, bookingId: billId}, retryPolicy = {maxRetries: int:max(2, 3), retryDelay: 1.5});
    json receipt = check ctx->callActivity(lookupBooking, {api: deskApi, bookingId: billId}, retryPolicy = opsNoRetryReviewers);
    string childId = check ctx->runChildWorkflow(childWorkflow = childFlow, input = billId);
}

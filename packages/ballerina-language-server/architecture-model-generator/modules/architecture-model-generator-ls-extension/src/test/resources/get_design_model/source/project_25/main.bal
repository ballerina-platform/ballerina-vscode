import ballerina/a2a;
import ballerina/ai;

listener a2a:RestListener tripPlannerA2aListener = new (9096);

final a2a:InMemoryTaskStore tripPlannerA2aTaskStore = new;

isolated class TripPlannerA2aExecutor {
    *a2a:AgentExecutor;

    public isolated function execute(a2a:RequestContext context, a2a:TaskUpdater updater)
            returns a2a:Message|a2a:Error? {
        check updater.working();
        string query = string:'join(" ", ...from a2a:Part part in context.message.parts
                    select part?.text ?: "");
        string|ai:Error reply = tripPlanner.run(query, sessionId = updater.getContextId());
        if reply is ai:Error {
            return error a2a:InternalError(reply.message(), message = reply.message());
        }
        check updater.addArtifact([{text: reply}]);
        check updater.complete();
        return;
    }
}

isolated service on tripPlannerA2aListener {

    private final a2a:DefaultHandler handler = new (new TripPlannerA2aExecutor(), taskStore = tripPlannerA2aTaskStore);

    isolated resource function post message\:send(a2a:Context context, a2a:SendMessageRequest request)
            returns a2a:Task|a2a:Message|a2a:Error {
        var response = self.handler.handleSendMessage(context, request);
        return response;
    }

    isolated resource function get tasks/[string id](a2a:Context context, a2a:GetTaskRequest request)
            returns a2a:Task|a2a:Error {
        var response = self.handler.handleGetTask(context, request);
        return response;
    }
}

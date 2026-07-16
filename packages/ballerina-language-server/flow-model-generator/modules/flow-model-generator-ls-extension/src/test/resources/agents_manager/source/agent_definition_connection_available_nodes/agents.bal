import ballerina/ai;
import ballerina/http;

public isolated class ConnectionAgent {
    *ai:FixedReturnAgentType;
    private final http:Client managedClient;
    private final ai:Agent agent;

    public function init(ai:ModelProvider model) returns error? {
        self.managedClient = check new ("http://localhost:9090");
        self.agent = check new (model = model);
    }
}

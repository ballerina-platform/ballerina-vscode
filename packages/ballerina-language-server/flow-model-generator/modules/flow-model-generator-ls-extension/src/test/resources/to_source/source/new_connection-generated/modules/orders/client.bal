import ballerina/http;

public isolated client class Client {
    final http:Client clientEp;

    public isolated function init(ConnectionConfig config, string serviceUrl = "http://localhost:9090/v1") returns error? {
        self.clientEp = check new (serviceUrl, auth = config.auth, timeout = config.timeout);
    }
}

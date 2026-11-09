import ballerina/http;

public type ConnectionConfig record {|
    http:BearerTokenConfig auth;
    decimal timeout = 30;
|};

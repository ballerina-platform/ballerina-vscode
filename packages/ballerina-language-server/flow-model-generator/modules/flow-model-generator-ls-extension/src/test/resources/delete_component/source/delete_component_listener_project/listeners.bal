import ballerina/http;

listener http:Listener sharedListener = new (9090);

listener http:Listener ownListener = new (9091);

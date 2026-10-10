import ballerina/http;

listener http:Listener httpDefaultListener = http:getDefaultListener();

service /'order on httpDefaultListener {

    resource function post .(@http:Payload OrderInfo payload) returns json|error {
    }

    resource function post [string orderId]/payment() returns json|error {
    }
}

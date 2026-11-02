import ballerina/http;

@http:ServiceConfig {
    laxDataBinding: true
}
service /api on new http:Listener(9090) {
    resource function get greeting() returns string {
        return "Hello";
    }
}

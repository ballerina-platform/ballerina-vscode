import ballerina/http as h;

listener h:Listener helloListener = new (9090);

service /hello on helloListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}

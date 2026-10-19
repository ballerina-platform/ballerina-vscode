import ballerina/http;

service /a on sharedListener {
    resource function get greeting() returns string {
        return "a";
    }
}

service /b on sharedListener {
    resource function get greeting() returns string {
        return "b";
    }
}

service /c on ownListener, new http:Listener(9092) {
    resource function get greeting() returns string {
        return "c";
    }
}

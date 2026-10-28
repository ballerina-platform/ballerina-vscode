import ballerina/graphql;

service /defaults on new graphql:Listener(9092) {

    resource function get greeting(string name = "", int times = 1, string? suffix = (), string prefix = "Hi")
            returns string {
        return name;
    }
}

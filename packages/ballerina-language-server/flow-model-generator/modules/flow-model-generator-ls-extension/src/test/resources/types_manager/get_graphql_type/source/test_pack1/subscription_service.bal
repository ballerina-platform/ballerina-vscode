import ballerina/graphql;

service /names on new graphql:Listener(9095) {

    resource function get name() returns string {
        return "";
    }

    resource function subscribe names() returns stream<string> {
        return ["Walter", "Skyler"].toStream();
    }
}

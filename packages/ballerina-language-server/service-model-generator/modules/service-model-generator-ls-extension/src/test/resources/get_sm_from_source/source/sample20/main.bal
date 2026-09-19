import ballerina/graphql;

listener graphql:Listener graphQLListener = new (9090);

service /first on graphQLListener {

    resource function get one() returns string {
        return "one";
    }

    resource function get two() returns string {
        return "two";
    }
}

service /second on graphQLListener {

    resource function get three() returns string {
        return "three";
    }
}

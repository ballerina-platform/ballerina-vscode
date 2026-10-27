import ballerina/graphql;

listener graphql:Listener graphqlDefaultListener = new (listenTo = 8080);

service graphql:Service /graphql on graphqlDefaultListener {
    resource function get query1() returns string {
    }

    resource function get query2() returns string {
    }

    resource function get query2() returns int {
    }
}

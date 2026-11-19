import ballerina/graphql;

service /fields on new graphql:Listener(9093) {

    resource function get name(int id) returns string {
        return self.format(id.toString());
    }

    resource function get account/id(int id) returns int {
        return id;
    }

    function format(string value) returns string {
        return value;
    }
}

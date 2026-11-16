import ballerina/graphql;

type Page distinct service object {
    resource function get items(int first = 10) returns string[];
};

service /pages on new graphql:Listener(9094) {

    resource function get page() returns Page? {
        return ();
    }
}

client class Store {
    remote function insert(string row) returns int|error {
        return 1;
    }

    resource function get rows() returns string[]|error {
        return [];
    }
}

final Store store = new;

function mayFail(string id) returns string|error {
    return id;
}

function uncheckedCalls(string id) {
    int|error inserted = store->insert(id);
    string[]|error rows = store->/rows;
    string|error value = mayFail(id);
}

function uncheckedCallsInErrorFunction(string id) returns error? {
    int|error inserted = store->insert(id);
    string|error value = mayFail(id);
}

function checkedCalls(string id) returns error? {
    int inserted = check store->insert(id);
    string value = check mayFail(id);
}

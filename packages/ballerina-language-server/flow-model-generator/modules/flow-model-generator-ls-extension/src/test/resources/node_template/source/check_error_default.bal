function mayFail() returns int|error {
    return 1;
}

function failOnly() returns error? {
    return;
}

function noErrorReturn() {

}

function errorReturn() returns error? {

}

function insideDo() {
    do {

    } on fail error e {
    }
}

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

function lambdaInsideDo() {
    do {
        var g = function() {

        };
    } on fail error e {
    }
}

function insideOnFail() {
    do {
    } on fail error e {

    }
}

function nestedDoInsideDoOnFail() {
    do {
        do {

        }
    } on fail error e {
    }
}

function insideForeachOnFail() {
    foreach int i in 0 ..< 2 {

    } on fail error e {
    }
}

function beforeDo() {

    do {
    } on fail error e {
    }
}

function neverReturns() returns never {

    panic error("x");
}

function workerOnFail() {
    worker w {

    } on fail error e {
    }
}

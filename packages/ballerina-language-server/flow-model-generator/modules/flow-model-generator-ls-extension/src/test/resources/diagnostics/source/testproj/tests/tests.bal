import ballerina/test;

@test:Config {}
function testExisting() returns error? {
}

@test:Config {}
function testAnother() returns error? {
}

int testModuleValue = 0;

function testWithLocal() {
    string localOnly = "";
}

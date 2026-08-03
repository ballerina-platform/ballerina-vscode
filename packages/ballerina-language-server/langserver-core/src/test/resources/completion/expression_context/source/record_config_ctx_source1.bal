import ballerina/module1;

type ConfigRecord record {
    string configStr;
    module1:Client httpClient;
    AnotherRecord nestedRecord;
};

type AnotherRecord record {
    int id;
    string name;
};

function testFunction() {
    ConfigRecord rec = {};
    rec.
}

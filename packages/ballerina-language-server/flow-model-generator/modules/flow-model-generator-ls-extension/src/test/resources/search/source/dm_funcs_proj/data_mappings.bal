import ballerina/ai;

function mapPersonToEmployee(Person person) returns Employee => {
    fullName: person.name,
    age: person.age
};

function formatName(string name) returns string {
    return name.toUpperAscii();
}

isolated function isAdult(int age) returns boolean {
    return age >= 18;
}

function suggestNickname(string name) returns string|error => natural (check ai:getDefaultModelProvider()) {
    Suggest a nickname for ${name}
};

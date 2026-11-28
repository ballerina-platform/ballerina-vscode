import ballerina/http as web;

enum Status {
    OPEN,
    CLOSED
}

type Intent "CAPTURE"|"AUTHORIZE";

type Payment Intent|"VOID";

type Name string;

type Customer record {|
    string name;
|};

type Order record {|
    Customer customer;
    Customer? shipTo;
    Customer[] buyers;
    string[] tags;
    Name label;
    Status status;
    Intent? intent;
    "A"|"B"|() grade;
    string|"VOID" note;
    readonly & Customer frozen;
    web:Method method;
|};

public function main() {
    web:Method method = web:GET;
}

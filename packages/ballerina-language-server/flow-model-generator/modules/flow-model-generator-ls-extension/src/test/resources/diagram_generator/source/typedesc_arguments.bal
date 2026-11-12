type Person record {|
    string name;
|};

type Order record {|
    int id;
|};

function load(typedesc<anydata> targetType) returns string {
    return targetType.toString();
}

function loadRows(typedesc<record {|anydata...;|}>[] rowTypes) returns int {
    return rowTypes.length();
}

function loadAny(typedesc t) returns string {
    return t.toString();
}

public function main() {
    typedesc<anydata> td = Person;
    typedesc<record {|anydata...;|}> rowType = Order;
    string byType = load(Person);
    string byVariable = load(td);
    string byTypeof = load(typeof byType);
    int rows = loadRows([Person, rowType]);
    string unconstrained = loadAny(Person);
}

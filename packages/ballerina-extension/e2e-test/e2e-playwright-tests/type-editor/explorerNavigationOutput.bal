type Customer1 record {|
    string id;
|};

type Address1 record {|
|};

type Order1 record {|
    Address1 customer;
    string note?;
|};

type Customer1 record {|
    string id;
|};

type Location1 record {|
|};

type Order1 record {|
    Location1 customer;
    string note?;
|};

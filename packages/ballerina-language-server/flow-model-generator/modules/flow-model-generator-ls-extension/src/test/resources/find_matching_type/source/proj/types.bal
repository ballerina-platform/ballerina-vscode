
type Address record {|
    string street;
    string city;
    string country;
|};

type EmployeeLog record {|
    string timestamp;
    string action;
    string userId;
    string description;
|};

type Employee record {|
    *Address;
    string employeeId;
    string department;
    decimal salary;
    EmployeeLog...;
|};

public type Pet readonly & record {
    string[] photoUrls;
    string name;
    int id?;
};

type Department record {|
    string name;
    Address location;
    Address[] branches?;
|};

type Card record {|
    string number;
|};

type Cash record {|
    decimal amount;
|};

type Payment record {|
    string id;
    Card|Cash method;
    (Card|Cash)[] splits?;
    Address|map<string> extra?;
|};


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

type DestinationConfig record {|
    string ashost;
    string sysnr;
    string user;
|};

type AdvancedConfig map<string>;

type Person record {
    string name1;
    string name2;
    boolean isMale?;
};

type Man record {
    string name1;
    string name2;
    boolean isMarried?;
};

type MyType record {
    string name1;
    string name2;
    Person|Man person;
};

type ConnectionParameters record {|
    string name1;
    Person|Man person;
|};

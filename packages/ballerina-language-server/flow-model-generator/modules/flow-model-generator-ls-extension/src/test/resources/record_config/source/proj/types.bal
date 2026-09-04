
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

type ServerCacheConfig record {|
    boolean enabled = true;
    int maxAge = 60;
    int maxSize = 15;
|};

type ReadonlyHolder record {|
    readonly & ServerCacheConfig cacheConfig;
    readonly & string[] tags;
    string name;
|};

type ReadonlyRoot readonly & record {|
    string id;
    int count;
|};

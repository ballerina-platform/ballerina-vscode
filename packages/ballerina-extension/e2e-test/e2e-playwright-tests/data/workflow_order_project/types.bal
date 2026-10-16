
type OrderInfo record {|
    string id;
    string customerId;
    string customerEmail;
    int total;
|};

# Data record for workflow function
type OrderWorkflowData record {|
    future<boolean> payment;
|};

type EmployeeDetails record {|
    string id;
    string name;
|};

type EmailChange record {|
    string customerId;
    string newEmail;
|};

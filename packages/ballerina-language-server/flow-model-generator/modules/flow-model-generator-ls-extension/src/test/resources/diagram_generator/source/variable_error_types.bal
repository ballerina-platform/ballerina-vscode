type LabError distinct error;

function labStatus() returns boolean|error => true;

function labCleanup() returns error? => ();

function labCount() returns int|LabError => 1;

function variableErrorTypes(boolean flag) returns error? {
    boolean|error fromTernary = flag ? labStatus() : labStatus();
    boolean|error fromLiteral = true;
    boolean|error fromCall = labStatus();
    boolean checked = check labStatus();
    error? cleanup = labCleanup();
    int|LabError count = labCount();
    string|error narrowed = "ready";
    if narrowed is error {
        return narrowed;
    }
    string afterNarrowing = narrowed;
}

function mapPersonToEmployee(Person person) returns Employee => {
    fullName: person.name,
    age: person.age
};

function formatName(string name) returns string {
    return name.toUpperAscii();
}

// Shares its name with the block-bodied `util:isAdult`, which must still be a regular function call
function isAdult(Person person) returns boolean => person.age >= 18;

// Quoted identifiers must still match the symbol name
function 'from(Person person) returns Employee => {
    fullName: person.name,
    age: person.age
};

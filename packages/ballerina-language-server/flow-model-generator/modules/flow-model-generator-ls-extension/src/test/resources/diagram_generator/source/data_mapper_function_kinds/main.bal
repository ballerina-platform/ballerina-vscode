import dm_kinds.util;

public function main() {
    Person person = {name: "John", age: 30};
    Employee employee = mapPersonToEmployee(person);
    string name = formatName(person.name);
    string label = util:toLabel(person.age);
    boolean adult = util:isAdult(person.age);
    Employee fromEmployee = 'from(person);
}

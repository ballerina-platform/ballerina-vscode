public function transform(Source src) returns Target => {
    fullName: string `${src.firstName} ${src.lastName}`,
    age: src.age
};

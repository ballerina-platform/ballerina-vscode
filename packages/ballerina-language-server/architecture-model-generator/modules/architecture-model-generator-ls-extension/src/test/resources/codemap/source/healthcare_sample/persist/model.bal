// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/persist as _;

public type PatientData record {|
    // FHIR: Patient.id
    readonly string id;

    // FHIR: Patient.name[0].text
    string? name;

    // FHIR: Patient.gender
    string? gender;

    // FHIR: Patient.birthDate
    string? birthDate;
|};

public type EncounterData record {|
    // FHIR: Encounter.id
    readonly string id;

    // FHIR: Encounter.status
    string status; // required

    // FHIR: Encounter.class.system
    string? encounterClassSystem;

    // FHIR: Encounter.class.code
    string? encounterClassCode;

    // FHIR: Encounter.class.display
    string? encounterClassDisplay;

    // FHIR: Encounter.type[0].text
    string? typeText;

    // FHIR: Encounter.subject.reference
    string subjectRef; // required

    // FHIR: Encounter.period.start
    string? periodStart;

    // FHIR: Encounter.period.end
    string? periodEnd;
|};

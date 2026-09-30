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

import healthcare_sample.db;

import ballerina/uuid;
import ballerinax/health.fhir.r4.uscore311;

// #############################################################################################################################################
// #                                               Mapper methods                                                                              #
// #############################################################################################################################################

public isolated function mapCustomPatientToFHIR(db:PatientDataOptionalized patient) returns uscore311:USCorePatientProfile => {
    id: patient?.id ?: uuid:createType1AsString(),
    identifier: [
        {
            system: "http://university-hospital.com/pid",
            value: patient?.id ?: generatePatientId()
        }
    ],
    gender: <uscore311:USCorePatientProfileGender>(patient?.gender ?: "unkown"),
    name: [
        {
            given: mapNameToGiven(patient?.name)
        }
    ],
    birthDate: patient?.birthDate
};

public isolated function mapFhirToCustomPatient(uscore311:USCorePatientProfile patient) returns db:PatientDataInsert => {
    gender: patient.gender,
    name: mapGivenToName(patient.name[0].given),
    id: uuid:createType1AsString(),
    birthDate: patient.birthDate
};

// #############################################################################################################################################
// #                                               Util methods                                                                                #
// #############################################################################################################################################
isolated function mapGivenToName(string[]? given) returns string {
    if given is string[] {
        return given[0];
    }
    return "";
}

isolated function mapNameToGiven(string? name) returns string[] {
    if name is string {
        return [name];
    }
    return [];
}

isolated int currentId = 4;

isolated function generatePatientId() returns string {
    lock {
        string numberPart = currentId.toString();
        int paddingLength = 3 - numberPart.length();

        if paddingLength > 0 {
            foreach int i in 1 ... paddingLength {
                numberPart = string `0${numberPart}`;
            }
        }

        numberPart = "P" + numberPart;
        currentId += 1;
        return numberPart;
    }
}

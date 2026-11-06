/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/** Whether a type takes the GraphQL "ID Type" flag: a scalar, an array of scalars, or a union of them. */
export const isGraphQLScalarType = (type: string): boolean => {
    const scalarTypes = [
        'string',
        'int',
        'float',
        'decimal'
    ];

    const isScalarOrArrayOfScalar = (t: string): boolean => {
        let cleanType = t.trim().replace(/\?$/, '');

        if (cleanType.endsWith('[]')) {
            const baseType = cleanType.slice(0, -2).trim();
            return isScalarOrArrayOfScalar(baseType);
        }

        if (cleanType.startsWith('(') && cleanType.endsWith(')')) {
            cleanType = cleanType.slice(1, -1).trim();
            if (cleanType.includes('|')) {
                const unionParts = cleanType.split('|').map(part => part.trim());
                return unionParts.every(part => isScalarOrArrayOfScalar(part));
            }
        }

        return scalarTypes.includes(cleanType.toLowerCase());
    };

    let cleanType = type.trim().replace(/\?$/, '');

    if (cleanType.endsWith('[]') && cleanType.includes('(') && cleanType.includes('|')) {
        const baseType = cleanType.slice(0, -2).trim();
        return isScalarOrArrayOfScalar(baseType);
    }

    if (cleanType.includes('|')) {
        const unionParts = cleanType.split('|').map(part => part.trim());
        return unionParts.every(part => isScalarOrArrayOfScalar(part));
    }

    if (cleanType.endsWith('[]')) {
        const baseType = cleanType.slice(0, -2).trim();
        return isScalarOrArrayOfScalar(baseType);
    }

    return isScalarOrArrayOfScalar(cleanType);
};

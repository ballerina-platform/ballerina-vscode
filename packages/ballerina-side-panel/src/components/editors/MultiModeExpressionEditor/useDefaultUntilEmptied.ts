/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { useEffect, useState } from "react";

/**
 * Tells a field that was emptied on purpose from one that was never touched.
 *
 * A dropdown presents the declared default of the parameter while the field is empty, which states what the
 * call does when no argument is written for it. Emptying the field on purpose leaves it empty too, so the two
 * states hold the same value and presenting the default for the second would drop the selection in front of
 * the person who just made it. Which of them the field is in is therefore remembered rather than read back.
 *
 * The choice lasts as long as the form is open. Reopening it presents the default once more, as an argument
 * that was never written leaves nothing in the source to tell the two apart.
 *
 * @param holdsAnEntry whether the field currently holds one of the entries the dropdown offers, which ends the
 *                     emptied state. Asked as a boolean rather than read from the value, since an entry may
 *                     stand for something falsy -- `false` is a selection, not an empty field.
 * @returns whether the field was emptied on purpose, and the callback to report that it just was
 */
export const useDefaultUntilEmptied = (holdsAnEntry: boolean): [boolean, () => void] => {
    const [emptiedByUser, setEmptiedByUser] = useState(false);

    useEffect(() => {
        if (holdsAnEntry) {
            setEmptiedByUser(false);
        }
    }, [holdsAnEntry]);

    return [emptiedByUser, () => setEmptiedByUser(true)];
};

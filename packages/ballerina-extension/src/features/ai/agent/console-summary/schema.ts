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

import { z } from "zod";

export const consoleSummarySchema = z.object({
    summary: z
        .string()
        .describe(
            "2-4 plain-text sentences, past tense, describing what this turn built or changed: what it does, what it connects, " +
            "and which settings the user provides. No markdown, code, file names, library names or tool names. At most ~600 characters."
        ),
});

export type ConsoleSummaryObject = z.infer<typeof consoleSummarySchema>;

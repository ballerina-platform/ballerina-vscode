/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 */

import styled from "@emotion/styled";
import { ModelResolutionError } from "@wso2/ballerina-core";
import { Button, Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";

const Container = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    color: ${ThemeColors.ON_SURFACE};
`;

const Message = styled(Typography)`
    max-width: 620px;
`;

export function modelResolutionMessage(error?: ModelResolutionError, fallback = "Unable to load the service model.") {
    return error?.message || fallback;
}

export function ServiceModelError({ error, onRetry }: { error?: ModelResolutionError; onRetry: () => void }) {
    return (
        <Container>
            <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
            <Message variant="body2">{modelResolutionMessage(error)}</Message>
            <Button appearance="secondary" onClick={onRetry}>Retry</Button>
        </Container>
    );
}

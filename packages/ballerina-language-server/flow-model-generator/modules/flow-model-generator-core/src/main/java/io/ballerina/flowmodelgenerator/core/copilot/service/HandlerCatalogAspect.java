/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.flowmodelgenerator.core.copilot.service;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BiConsumer;

/**
 * The spec/the spec — builds every handler of a service type, and through them every parameter.
 *
 * <p>This is the only component that knows how many handlers exist, so it is the one that drives the
 * handler and parameter tiers. Running last among the service aspects is therefore not a convention but a
 * consequence: the tiers below it cannot exist until it has resolved the catalog.
 *
 * @since 1.7.0
 */
final class HandlerCatalogAspect {

    private final List<BiConsumer<HandlerScope, HandlerDraft>> handlerAspects;
    private final List<BiConsumer<ParamScope, ParamDraft>> paramAspects;

    HandlerCatalogAspect(List<BiConsumer<HandlerScope, HandlerDraft>> handlerAspects,
                         List<BiConsumer<ParamScope, ParamDraft>> paramAspects) {
        this.handlerAspects = handlerAspects;
        this.paramAspects = paramAspects;
    }

    void contribute(TriggerScope scope, ServiceDraft draft) {
        String typeName = scope.serviceTypeName();
        HandlerCatalogResolver.CatalogResolution resolution =
                HandlerCatalogResolver.resolve(scope.serviceType(), typeName, scope.facts());

        // Every way the document had to be tolerated, recorded against the service type it affected.
        // Non-fatal by construction: the entry still renders, which is the whole point of tolerating it —
        // but the reason now reaches the veto report, so a test can assert it and a document author can
        // find it without reading the language server's log.
        for (String degradation : resolution.degradations()) {
            draft.drop("handlerCatalog: " + typeName + ": " + degradation);
        }

        switch (resolution.catalog()) {
            case HandlerCatalogResolver.HandlerCatalog.None none ->
                    draft.veto("handlerCatalog: " + typeName + ": " + none.reason());
            case HandlerCatalogResolver.HandlerCatalog.Concrete concrete ->
                    buildDeclared(scope, draft, concrete.methods());
            case HandlerCatalogResolver.HandlerCatalog.Documented documented -> {
                // The spec lets the two coexist, so both lists are built rather than one branch winning.
                // Named options come first: a reader looking for a method to copy should meet the ones that
                // are copyable before the shapes that have to be instantiated.
                buildFromOptions(scope, draft, documented.named());
                for (TriggerMetadataModel.ServiceType.HandlerOption template : documented.templates()) {
                    buildTemplate(scope, draft, template);
                }
            }
        }
    }

    /**
     * An open-ended service type: the wildcard describes the shape of a handler the author will name.
     *
     * <p>Built through the <b>same</b> handler and parameter aspects a named option goes through, rather
     * than by a bespoke path. That is what keeps the spec's kind and return, the spec's types and alternatives, and
     * The spec's function- and parameter-scope obligations owned by exactly one component each: the template
     * gains every one of them for free, and a later spec change to any of them cannot leave the template
     * behind.
     */
    private void buildTemplate(TriggerScope scope, ServiceDraft draft,
                               TriggerMetadataModel.ServiceType.HandlerOption template) {
        HandlerScope handlerScope = new HandlerScope(scope, template, null);
        HandlerDraft handlerDraft = new HandlerDraft();

        if (ParamTypeResolver.signatureReferencesUndeclaredType(template, scope.declaresType())) {
            // Same guard a named option gets: a template naming a type the resolved package does not
            // declare would describe a handler nobody can write.
            handlerDraft.veto("handlerCatalog: " + scope.serviceTypeName()
                    + ": its handler template references a type the resolved package does not declare");
            draft.addHandlerTemplate(handlerDraft);
            return;
        }

        for (BiConsumer<HandlerScope, HandlerDraft> aspect : handlerAspects) {
            aspect.accept(handlerScope, handlerDraft);
        }
        buildOptionParams(handlerScope, handlerDraft, template.params());
        draft.addHandlerTemplate(handlerDraft);
    }

    /** A concrete service type: every handler and parameter is read from the semantic model. */
    private void buildDeclared(TriggerScope scope, ServiceDraft draft,
                               List<TriggerSemanticFacts.DeclaredMethod> methods) {
        for (TriggerSemanticFacts.DeclaredMethod declared : methods) {
            HandlerScope handlerScope = new HandlerScope(scope, null, declared);
            HandlerDraft handlerDraft = runHandlerAspects(handlerScope);

            List<TriggerSemanticFacts.DeclaredParam> params = declared.params();
            for (int i = 0; i < params.size(); i++) {
                ParamScope paramScope = new ParamScope(handlerScope, null, params.get(i), i, Set.of());
                handlerDraft.addParam(runParamAspects(paramScope));
            }
            draft.addHandler(handlerDraft);
        }
    }

    /** A marker service type: the document's options are the only source of truth. */
    private void buildFromOptions(TriggerScope scope, ServiceDraft draft,
                                  List<TriggerMetadataModel.ServiceType.HandlerOption> options) {
        if (options == null) {
            return;
        }
        for (TriggerMetadataModel.ServiceType.HandlerOption option : options) {
            if (option == null || option.name() == null) {
                continue;
            }
            // Defence in depth, not dead code. A wildcard reaching this loop would render a handler
            // literally named `*`, which is not an identifier. It cannot arrive today — the resolver
            // routes any wildcard to `Many` — but that routing is one branch away from this one, and the
            // failure it prevents is silent and uncompilable rather than loud.
            if (TriggerMetadataModel.ServiceType.HandlerOption.WILDCARD_NAME.equals(option.name())) {
                draft.drop("handlerCatalog: " + option.name()
                        + ": a \"*\" option reached the fixed-vocabulary path, where it has no writable name");
                continue;
            }

            HandlerScope handlerScope = new HandlerScope(scope, option, null);
            HandlerDraft handlerDraft = new HandlerDraft();

            if (ParamTypeResolver.signatureReferencesUndeclaredType(option, scope.declaresType())) {
                handlerDraft.veto("handlerCatalog: " + option.name()
                        + ": its signature references a type the resolved package does not declare");
                draft.addHandler(handlerDraft);
                continue;
            }

            for (BiConsumer<HandlerScope, HandlerDraft> aspect : handlerAspects) {
                aspect.accept(handlerScope, handlerDraft);
            }
            buildOptionParams(handlerScope, handlerDraft, option.params());
            draft.addHandler(handlerDraft);
        }
    }

    /**
     * Builds a metadata handler's parameters.
     *
     * <p>The name pool is seeded with every authored name in the option <i>before</i> any name is generated,
     * so a generated name can never collide with an authored one declared later in the list. The positional
     * fallback uses the slot's index in the full list, which keeps a generated name stable when an unrelated
     * slot is added or removed.
     *
     */
    private void buildOptionParams(HandlerScope handlerScope, HandlerDraft handlerDraft,
                                   List<TriggerMetadataModel.ServiceType.Param> params) {
        if (params == null || params.isEmpty()) {
            return;
        }
        Set<String> usedNames = new HashSet<>();
        for (TriggerMetadataModel.ServiceType.Param param : params) {
            if (param != null && param.name() != null) {
                usedNames.add(param.name());
            }
        }
        for (int i = 0; i < params.size(); i++) {
            ParamScope paramScope = new ParamScope(handlerScope, params.get(i), null, i, usedNames);
            handlerDraft.addParam(runParamAspects(paramScope));
        }
    }

    private HandlerDraft runHandlerAspects(HandlerScope scope) {
        HandlerDraft draft = new HandlerDraft();
        for (BiConsumer<HandlerScope, HandlerDraft> aspect : handlerAspects) {
            aspect.accept(scope, draft);
        }
        return draft;
    }

    private ParamDraft runParamAspects(ParamScope scope) {
        ParamDraft draft = new ParamDraft();
        for (BiConsumer<ParamScope, ParamDraft> aspect : paramAspects) {
            aspect.accept(scope, draft);
        }
        return draft;
    }
}

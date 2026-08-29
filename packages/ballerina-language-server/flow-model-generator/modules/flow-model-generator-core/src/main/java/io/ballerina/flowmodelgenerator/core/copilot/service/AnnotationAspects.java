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

import java.util.List;

/**
 * The spec {@code annotations[]} at all four attach points: which annotations generated code must or may
 * carry, on the service, on a handler, on a handler parameter, and on a handler's return.
 *
 * <p>The four differ only in where the id list is read from, which {@link AnnotationScopeResolver.Scope}
 * they select with, and which draft slot they write to; selection itself is one by-id lookup shared by all
 * of them, which is why they are grouped here rather than split across eight files.
 *
 * <p><b>What the spec adds over the library's own annotation list.</b> That list states which annotations a
 * library <i>declares</i>, a fact the compiler reports. These state which ones a construct is <i>obliged to
 * attach</i> — the obligation, its presence and its scope, none of which any symbol carries.
 *
 * <p><b>Rejections {@code drop}, they do not {@code veto}.</b> An unresolvable obligation makes the
 * obligation unusable, not the construct carrying it.
 *
 * <p>{@code ballerina/http} and {@code ballerina/graphql} both declare an optional service-level
 * {@code serviceConfig}. Their curated overlay entry collides by name with the synthesized one, and
 * {@code ServiceLoader.mergeWithGenericServices} now keeps the synthesized entry, so the obligation this
 * component resolves does reach the prompt.
 *
 * @since 1.7.0
 */
final class AnnotationAspects {

    private static final String SPEC_SECTION = "the spec";

    private AnnotationAspects() {
        // Prevent instantiation
    }

    /**
     * The spec at {@code attachPoint: "service"}.
     *
     * <p>Selected by <b>id</b> from {@code serviceTypes[].annotations}, the same forward reference every
     * other point uses. There is deliberately no fallback: an annotation the service type does not
     * reference attaches nowhere. Two corpus documents ({@code smb}, {@code rabbitmq}) reach their service
     * annotation only from a rule subject, which the spec's table does not make a reference site — a rule says
     * what an annotation <i>relates to</i>, not where it goes.
     *
     * <p>Note that {@code annotations[].type} names the annotation, not its constraint:
     * {@code ballerina/ftp} declares {@code type: {"name": "ServiceConfig"}} while the package declares
     * {@code public annotation ServiceConfiguration ServiceConfig on service;}. The constraining record is
     * therefore introspected from the compiler, never read from the document.
     */
    static void service(TriggerScope scope, ServiceDraft draft) {
        AnnotationScopeResolver.Resolution resolution = AnnotationScopeResolver.byIds(
                scope.annotations(),
                scope.serviceType() == null ? null : scope.serviceType().annotations(),
                AnnotationScopeResolver.Scope.SERVICE,
                scope.homeModule(),
                AnnotationScopeResolver.factsOf(scope.facts()));

        report(resolution, draft, "serviceAnnotation");
        draft.setAnnotations(AnnotationRefWriter.write(resolution.refs(), scope.packageName()));
    }

    /**
     * The spec at {@code attachPoint: "function"} — reached by id from {@code handlers.options[].annotations}.
     *
     * <p>Only a metadata-described handler can declare them: a concrete service type's methods come from the
     * semantic model, and any annotation they already carry is a fact about the library rather than an
     * obligation on generated code. A resource handler admits a narrower set of declared attach points than
     * a remote one, which is why the kind decides the scope.
     */
    static void handler(HandlerScope scope, HandlerDraft draft) {
        TriggerMetadataModel.ServiceType.HandlerOption option = scope.option();
        if (option == null || option.annotations() == null || option.annotations().isEmpty()) {
            return;
        }
        TriggerScope service = scope.service();
        boolean resource = HandlerRules.resolveKind(option.kind()).isResource();
        AnnotationScopeResolver.Resolution resolution = AnnotationScopeResolver.byIds(
                service.annotations(), option.annotations(),
                resource ? AnnotationScopeResolver.Scope.RESOURCE_HANDLER
                        : AnnotationScopeResolver.Scope.REMOTE_HANDLER,
                service.homeModule(), AnnotationScopeResolver.factsOf(service.facts()));

        report(resolution, draft, "handlerAnnotation");
        draft.setAnnotationRefs(AnnotationRefWriter.write(resolution.refs(), service.packageName()));
    }

    /**
     * The spec at {@code attachPoint: "parameter"} — reached by id from {@code params[].annotations}.
     *
     * <p>The rendered slot differs from every other scope: a parameter annotation is written <b>inline</b>,
     * before the parameter's type ({@code remote function onMessage(@rabbitmq:Payload AnydataMessage msg)}).
     * That is also why its presence cannot be marked with a trailing {@code //} comment, which inside a
     * parameter list would comment out the closing paren and the return type.
     */
    static void param(ParamScope scope, ParamDraft draft) {
        TriggerMetadataModel.ServiceType.Param param = scope.param();
        if (param == null || param.annotations() == null || param.annotations().isEmpty()) {
            return;
        }
        TriggerScope service = scope.handler().service();
        AnnotationScopeResolver.Resolution resolution = AnnotationScopeResolver.byIds(
                service.annotations(), param.annotations(), AnnotationScopeResolver.Scope.PARAMETER,
                service.homeModule(), AnnotationScopeResolver.factsOf(service.facts()));

        report(resolution, draft, "paramAnnotation");
        draft.setAnnotationRefs(AnnotationRefWriter.write(resolution.refs(), service.packageName()));
    }

    /**
     * The spec §8 at {@code attachPoint: "return"} — reached by id from
     * {@code handlers.options[].returns.annotations}.
     *
     * <p><b>The list moved in the spec's 2026-08-19 revision</b>, from a sibling {@code returnAnnotations}
     * on the handler onto the {@code returns} object itself. That is where it belongs: the obligation
     * attaches to the return slot, and filing it beside the type it attaches to is what stops a handler
     * with no return clause from carrying return annotations at all. Nothing else about this aspect
     * changed, which is why the read is a one-line accessor swap.
     *
     * <p>Runs in the handler tier because the return slot belongs to a handler, and is resolved
     * <b>per handler</b>: selection used to be by attach point, which is a document-wide question, so every
     * return-pointed annotation attached to every handler — {@code ballerina/http}'s {@code $cache} would
     * have landed on handlers whose return is not cacheable at all.
     *
     * <p>It targets a different syntactic slot from {@link #handler} — {@code returns @http:Cache {...} T}
     * rather than a declaration-level attachment. The refs go to
     * {@link HandlerDraft#setReturnAnnotationRefs}, which merges them into the return object at emit time,
     * so this carries no ordering dependency on {@link HandlerAspects#returnType}.
     */
    static void returnValue(HandlerScope scope, HandlerDraft draft) {
        TriggerScope service = scope.service();
        AnnotationScopeResolver.Resolution resolution = AnnotationScopeResolver.byIds(
                service.annotations(),
                returnAnnotationIds(scope.option()),
                AnnotationScopeResolver.Scope.RETURN,
                service.homeModule(), AnnotationScopeResolver.factsOf(service.facts()));
        if (resolution.refs().isEmpty() && resolution.rejections().isEmpty()) {
            return;
        }
        report(resolution, draft, "returnAnnotation");
        draft.setReturnAnnotationRefs(AnnotationRefWriter.write(resolution.refs(), service.packageName()));
    }

    /**
     * The return-scope annotation ids a handler option declares — {@code returns.annotations}, or nothing
     * for a concrete method and for a handler whose language form carries no return clause.
     */
    private static List<String> returnAnnotationIds(TriggerMetadataModel.ServiceType.HandlerOption option) {
        if (option == null || option.returns() == null) {
            return null;
        }
        return option.returns().annotations();
    }

    private static void report(AnnotationScopeResolver.Resolution resolution, ServiceDraft draft, String id) {
        for (AnnotationScopeResolver.Rejection rejection : resolution.rejections()) {
            draft.drop(id + ": " + rejection.name() + ": " + rejection.reason());
        }
    }

    private static void report(AnnotationScopeResolver.Resolution resolution, HandlerDraft draft, String id) {
        for (AnnotationScopeResolver.Rejection rejection : resolution.rejections()) {
            draft.drop(id + ": " + rejection.name() + ": " + rejection.reason());
        }
    }

    private static void report(AnnotationScopeResolver.Resolution resolution, ParamDraft draft, String id) {
        for (AnnotationScopeResolver.Rejection rejection : resolution.rejections()) {
            draft.drop(id + ": " + rejection.name() + ": " + rejection.reason());
        }
    }
}

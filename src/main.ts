import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs } from "@vue/reactivity"
import { WithDerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import { $if, $for, app, div, p, button, input, textarea, span } from "./libs/lib-view"
import {parseRule} from "./parser"
import {Rule, relationDependencyGraph, Component, RecursiveGroup} from "./semantics"

//#region  --- Essential & derived state ---

interface RuleEditor {
    readonly label: string
    readonly rawText: string
    errorText: string | null
    lastParsed: null | {
        readonly rawText: string
        readonly rule: Rule
    }
}

function RuleEditor(): RuleEditor {
    return {
        label: "",
        rawText: "",
        errorText: null,
        lastParsed: null,
    }
}

interface State {
    readonly rules: RuleEditor[]
    readonly relationDepGraph: Component[]
    readonly groupsWithInternalNegation: {errorText: string}[]
}

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        rules:
            [] as RuleEditor[],
        // Derived state (to be overwritten):
        relationDepGraph: [],
        groupsWithInternalNegation: [],
    }
    return withDerivedProps<State>(essentialState, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        relationDepGraph: state => {
            const rawRules: Rule[] = []
            state.rules.forEach(r => {
                if (r.lastParsed !== null) rawRules.push(r.lastParsed.rule)
            })
            return relationDependencyGraph(rawRules)
        },
        groupsWithInternalNegation: state => {
            const badGroups: {errorText: string}[] = []
            state.relationDepGraph.forEach(component => {
                if (component.type !== "recursiveGroup") return // try next component
                for (const relation of component.relations) {
                    for (const rule of state.rules) {
                        if (rule.lastParsed !== null && rule.lastParsed.rule.head.relation === relation) {
                            for (const fact of rule.lastParsed.rule.body) {
                                if (fact.sign === "negative" && component.relations.has(fact.relation)) {
                                    let errorText = ""
                                    component.relations.forEach(r => errorText += r + ", ")
                                    badGroups.push({errorText})
                                    return // Move into next component
                                }
                            }
                        }
                    }
                }
            })
            return badGroups
        },
    })
}

//#endregion
//#region  --- State initialization, saving and loading ---

const state: WithDerivedProps<State> =
    // Load previous state, if applicable
    (   localStorage.loadLastState === "true"
     && localStorage.state !== undefined
     && localStorage.state !== "undefined"
    )
    ? createState(Cycle.retrocycle(JSON.parse(localStorage.state)))
    : createState()

// By default, load the previous state on page load
localStorage.loadLastState = true

function saveState(): void {
    // If an input element is focused, trigger its blur event
    if (document.activeElement !== null && document.activeElement.tagName === "INPUT") {
        (document.activeElement as HTMLInputElement).blur()
    }
    localStorage.state = JSON.stringify(Cycle.decycle(state))
}

function onVisibilityChange(): void {
    if (document.hidden) saveState()
}

// Save whenever the page is hidden (including when closed).
// This doesn't work in Safari, because it doesn't follow the Visibility API spec.
// The following page can be used to test what lifecycle events are triggered:
// http://output.jsbin.com/zubiyid/latest/quiet
window.addEventListener("visibilitychange", onVisibilityChange)

// Detect desktop/mobile Safari, including Chrome on iOS etc. (wrappers over Safari).
// Note: iPadOS pretends to be desktop Safari, making desktop and mobile
// indistinguishable, despite the fact that their implementations differ.
const safari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent)

if (safari) {
    const text = document.createElement("p")
    text.textContent = "If you are using iOS, be warned that autosaving does not work."
    document.body.prepend(text)
    // This intervention works in desktop Safari, but not iOS Safari:
    addEventListener("beforeunload", saveState)
}

function loadLastSave(): void {
    window.removeEventListener("visibilitychange", onVisibilityChange)
    location.reload()
}

function resetState(): void {
    localStorage.loadLastState = false
    location.reload()
}

//#endregion
//#region  --- The view & transition logic ----

function newRule(i: number): void {
    state.rules.insert(i, RuleEditor())
}

// Insert a static toolbar that will be visible even if the app crashes during creation
document.body.prepend(
    div ({class: "toolbar"}, [
        button ("Reset state", {
            onclick: resetState,
        }),
    ]),
    div ({class: "separator"}),
)

app ("app", state,
    div ({class: "view"}, [
        div ({class: "graphView"}, [
            $for (() => state.relationDepGraph, component => [
                component.type === "node"
                    ? p (component.relation, {class: "nodeComponent"})
                    : div ({class: "recursiveGroupComponent"}, [
                        span("⮕"),
                        div({class: "spacer"}),
                        $for (() => Array.from(component.relations).map(r => {return {relation: r}}), o => [
                            span(o.relation + ","),
                            div({class: "spacer"}),
                        ]),
                      ]),
            ]),
        ]),
        div ({class: "ruleView"}, [
            $for (() => state.groupsWithInternalNegation, o => [
                p (() => `The following recursive group has internal negation: ${o.errorText}`, {
                    class: "errorText",
                }),
            ]),
            button ("", {
                class: "ruleInsertionPoint",
                onclick: () => newRule(0),
            }),
            $for (() => state.rules, rule => [
                div ({class: "rule"}, [
                    div ({class: "ruleLabelBar"}, [
                        input ({
                            class: "ruleLabelText",
                            autocomplete: "nope",
                            autocapitalize: "off",
                            value: toRefs(rule).label,
                        }),
                        button ("•••", {
                            class: "ruleDragHandle",
                            onclick: () => state.rules.removeAt(rule.$index),
                        }),
                    ]),
                    div ({class: "row"}, [
                        div ({class: "ruleTextDiv"}, [
                            textarea ({
                                class: "ruleTextArea",
                                value: toRefs(rule).rawText,
                                onkeydown: (event: KeyboardEvent) => {
                                    const el = (event.target as HTMLTextAreaElement)
                                    // React to vanilla key presses only
                                    if (!event.ctrlKey && !event.metaKey) {
                                        // Do basic autoformatting.
                                        // Note: execCommand() is needed to preserve the browser's undo stack, and setTimeout() prevents a nested DOM update.
                                        if (event.key === ",") {
                                            event.preventDefault()
                                            setTimeout(() =>
                                                document.execCommand("insertText", false, ", "), 0)
                                        }
                                        else if (event.key === "Enter") {
                                            event.preventDefault()
                                            setTimeout(() =>
                                                document.execCommand("insertText", false, "\n  "), 0)
                                        }
                                        else if (event.key === "-") {
                                            event.preventDefault()
                                            setTimeout(() =>
                                                document.execCommand("insertText", false, "¬"), 0)
                                        }
                                        // Disallow spaces next to an existing space, unless at the start of a line
                                        else if (
                                            event.key === " " && !(
                                                el.selectionStart >= 1 && rule.rawText[el.selectionStart-1] === "\n"
                                            ) && !(
                                                el.selectionStart > 1 && rule.rawText[el.selectionStart-2] === "\n"
                                            ) && (
                                                (el.selectionStart >= 1 && rule.rawText[el.selectionStart-1] === " ") || (el.selectionEnd < rule.rawText.length && rule.rawText[el.selectionEnd] === " ")
                                            )
                                        ) {
                                            event.preventDefault()
                                        }
                                    }
                                },
                                oninput: (event: Event) => {
                                    const el = (event.target as HTMLTextAreaElement)
                                    const parseResult = parseRule(rule.rawText)
                                    if (parseResult.result === "success") {
                                        rule.lastParsed = {
                                            rawText: rule.rawText,
                                            rule: parseResult.rule,
                                        }
                                        rule.errorText = null
                                    }
                                    else if (parseResult.result === "noRule") {
                                        rule.lastParsed = null
                                        rule.errorText = null
                                    }
                                    else {
                                        rule.errorText = parseResult.reason
                                    }
                                    // resize the box to fit its contents
                                    el.style.height = "auto"
                                    el.style.height = el.scrollHeight + "px"
                                },
                            }),
                            $if (() => rule.errorText !== null, {
                                $then: () => [
                                    p (() => rule.errorText as string, {
                                        class: "errorText",
                                    }),
                                ],
                                $else: () => [],
                            }),
                        ]),
                        div ({class: "decompressionPane"}, [
                            p ("likes(#bob, #jill)"),
                        ]),
                    ]),
                ]),
                button ("", {
                    class: "ruleInsertionPoint",
                    onclick: () => newRule(rule.$index+1),
                }),
            ]),
            div ({class: "separator"}),
            div ({class: "viewBottomPadding"}),
        ]),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

// Hack to make textareas stretch to fit content
const textAreas = document.getElementsByTagName("textarea")
for (let i = 0; i < textAreas.length; i++) {
    textAreas[i].style.height = textAreas[i].scrollHeight + "px"
}

//#endregion
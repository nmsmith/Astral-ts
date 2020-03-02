import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs } from "@vue/reactivity"
import { WithDerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import { h1, h3, $if, $for, app, div, p, button, input, textarea, span, list, $set, defineDOMUpdate } from "./libs/lib-view"
import {parseRule} from "./parser"
import {Rule, analyseRuleGraph, Component, RuleGraphInfo } from "./semantics"

//#region  --- Essential & derived state ---

interface RuleEditor {
    readonly label: string
    readonly rawText: string
    errorText: string | null
    lastParsed: null | {
        readonly rawText: string
        readonly rule: Rule
    }
    ruleBoxHeight: number
}

function RuleEditor(): RuleEditor {
    return {
        label: "",
        rawText: "",
        errorText: null,
        lastParsed: null,
        ruleBoxHeight: 101, // Have to hardcode this, since we have no way to observe it on element creation
    }
}

interface LayoutInfo {
    readonly column: RuleEditor[]
}

interface State {
    readonly ruleEditors: Set<RuleEditor>
    readonly selectedRule: RuleEditor | null
// derived state:
    readonly ruleGraph: RuleGraphInfo // determined by analysis of parsed rules
    readonly ruleLayoutInfo: Map<RuleEditor, LayoutInfo> // determined from graph info
    readonly groupsWithInternalNegation: {errorText: string}[] // TODO: include this in RuleGraphInfo
}

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        ruleEditors:
            new Set<RuleEditor>(),
        selectedRule: null,
        // Derived state (to be overwritten):
        ruleGraph: {} as RuleGraphInfo,
        ruleLayoutInfo: new Map<RuleEditor, LayoutInfo>(),
        groupsWithInternalNegation: [],
    }
    return withDerivedProps<State>(essentialState, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        ruleGraph: state => {
            const rawRules = new Set<Rule>()
            state.ruleEditors.forEach((_, r) => {
                if (r.lastParsed !== null) rawRules.add(r.lastParsed.rule)
            })
            return analyseRuleGraph(rawRules)
        },
        ruleLayoutInfo: state => {
            const layoutInfo = new Map<RuleEditor, LayoutInfo>()
            const column: RuleEditor[] = []
            state.ruleEditors.forEach(r => {
                // put all the rules in one column for now
                column.push(r)
                layoutInfo.set(r, {column})
            })
            return layoutInfo
        },
        groupsWithInternalNegation: state => {
            return []
            // const badGroups: {errorText: string}[] = []
            // state.relationDepGraph.forEach(component => {
            //     if (component.type !== "recursiveGroup") return // try next component
            //     for (const relation of component.relations) {
            //         for (const rule of state.rules.keys()) {
            //             if (rule.lastParsed !== null && rule.lastParsed.rule.head.relation === relation) {
            //                 for (const fact of rule.lastParsed.rule.body) {
            //                     if (fact.sign === "negative" && component.relations.has(fact.relation)) {
            //                         let errorText = ""
            //                         component.relations.forEach(r => errorText += r + ", ")
            //                         badGroups.push({errorText})
            //                         return // Move into next component
            //                     }
            //                 }
            //             }
            //         }
            //     }
            // })
            // return badGroups
        },
    })
}

//#endregion
//#region  --- State initialization, saving and loading ---

// Define the serialization of Maps to JSON
declare global {
    interface Map<K, V> {
        toJSON(): any[]
    }
    interface Set<T> {
        toJSON(): any[]
    }
}

const mapTypeMarker = "$Map()$"
const setTypeMarker = "$Set()$"

Map.prototype.toJSON = function() {
    const array: any[] = Array.from(this.entries())
    array.push(mapTypeMarker) // mark this array as a Map type
    return array
}

Set.prototype.toJSON = function() {
    const array: any[] = Array.from(this.keys())
    array.push(setTypeMarker) // mark this array as a Set type
    return array
}

// Identify which serialized arrays were actually Maps and Sets,
// and reconstruct them.
function parseMapsAndSets(key: string, value: any): any {
    if (Array.isArray(value) && value.length > 0) {
        const lastValue = value[value.length-1]
        if (lastValue === mapTypeMarker) {
            return new Map(value.slice(0, -1))
        } else if (lastValue === setTypeMarker) {
            return new Set(value.slice(0, -1))
        }
        else return value
    }
    else {
        return value
    }
}

const state: WithDerivedProps<State> =
    // Load previous state, if applicable
    (   localStorage.loadLastState === "true"
     && localStorage.state !== undefined
     && localStorage.state !== "undefined"
    )
    ? createState(Cycle.retrocycle(JSON.parse(localStorage.state, parseMapsAndSets)))
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

function newRule(): void {
    state.ruleEditors.add(RuleEditor())
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

const ruleEditorSpacing = {x: 50, y: 30}

function computeTopPosition(rule: RuleEditor): number {
    // TODO: There is some stupid bug (regarding proxies I think) that is preventing
    // the (commented out) next line from working as expected. Map.get() doesn't work.
    let layout = undefined//state.ruleLayoutInfo.get(rule)
    // Hack alternative to Map.get():
    for (const entry of state.ruleLayoutInfo.entries()) {
        if (entry[0] === rule) {
            layout = entry[1]
        }
    }
    if (layout === undefined) {
        return -123 // should never happen
    }
    else {
        return layout.column.slice(0, layout.column.indexOf(rule)).reduce((total, r) => total + r.ruleBoxHeight + ruleEditorSpacing.y, 0)
    }
}

app ("app", state,
    div ({class: "view"}, [
        div ({class: "col"}, [
            h1 ("Design directions"),
            list ({class: "ideaList"}, {class: "listItem"}, [
                h3 ("The neighbourhood of an element should always be visible, so that the effects of incremental changes are obvious (Lean on video games e.g. Factorio: inherently local cause-and-effect)."),
                h3 ("Andy Matuschak (his notes): we learn SKILLS and UNDERSTANDING through doing, and observing/mimicking the tacit knowledge of \"experts\" (craftsmen, Twitch streamers, lecturers explaining)."),
                h3 ("But how do we develop NEW APPROACHES to (as opposed to understanding of) a problem/task? First, gain a MASTERFUL UNDERSTANDING of the existing problem & approaches, and then develop approaches from there (e.g. reasoning by first principles)."),
                h3 ("As I keep re-discovering, graphs are crap, and there is no \"magic\" visualisation waiting to be invented. What core visual primitives can communicate data and their relationships? Relative positioning, shape and colour matching... Review literature."),
            ]),
            $for (() => state.groupsWithInternalNegation, o => [
                p (() => `The following recursive group has internal negation: ${o.errorText}`, {
                    class: "errorText",
                }),
            ]),
            button ("Add rule", {onclick: newRule}),
            div ({class: "ruleView"}, [
                $set (() => new Set(state.ruleLayoutInfo.keys()), rule => [
                    div ({
                        class: "rule",
                        top: () => computeTopPosition(rule),
                    }, [
                        div ({class: "ruleLabelBar"}, [
                            input ({
                                class: "ruleLabelText",
                                autocomplete: "nope",
                                autocapitalize: "off",
                                value: toRefs(rule).label,
                            }),
                            button ("•••", {
                                class: "ruleDragHandle",
                                onclick: () => state.ruleEditors.delete(rule),
                            }),
                        ]),
                        div ({class: "row"}, [
                            div ({class: "ruleTextWithErrors"}, [
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

                                        const ruleDiv = el.parentElement?.parentElement?.parentElement as HTMLElement
                                        el.style.height = "auto"  // trigger the text box to auto-size
                                        el.style.height = el.scrollHeight + "px" // new stretch it to fit contents

                                        // Delay the reading of the rule div height until the
                                        // currently-executing DOM update has fully finished
                                        // (the div's height may change during the update).
                                        setTimeout(() => {
                                            // Create a new DOM update to finish the work.
                                            defineDOMUpdate(() => {
                                                // Record the height of the WHOLE rule div,
                                                // so we can use it for code-driven layout.
                                                rule.ruleBoxHeight = ruleDiv.scrollHeight
                                            })({
                                                type: "Manual delayed update",
                                                target: ruleDiv,
                                            })
                                        }, 0)
                                        // TODO: Can I detect which text boxes remain in the same
                                        // column as the one just edited and "skip" their animation?
                                        // This would prevent the mismatch between instant textbox
                                        // resizing, and delayed "making room" for the new size.
                                        // const ruleDivs = document.getElementsByClassName("rule")
                                        // for (let i = 0; i < ruleDivs.length; ++i) {
                                        //     (ruleDivs[i] as HTMLElement).style.transitionDuration = "0s"
                                        // }
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
                        ]),
                    ]),
                ]),
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

// Auto-size the text boxes immediately, since they will be auto-sized after every edit
const textAreas = document.getElementsByClassName("ruleTextArea")
for (let i = 0; i < textAreas.length; i++) {
    (textAreas[i] as HTMLElement).style.height = textAreas[i].scrollHeight + "px"
}

//#endregion
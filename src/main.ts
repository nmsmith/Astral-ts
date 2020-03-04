import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs, reactive as observable } from "@vue/reactivity"
import { WithDerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import { h1, h3, $if, $for, app, div, p, button,  textarea, span, list, $set, defineDOMUpdate } from "./libs/lib-view"
import {parseRule} from "./parser"
import {Rule, analyseRuleGraph, Component, RuleGraphInfo, Relation } from "./semantics"

//#region  --- Essential & derived state ---

interface RuleCard {
    readonly rawText: string
    errorText: string | null
    lastParsed: null | {
        readonly rawText: string
        readonly rule: Rule
    }
    ruleCardHeight: number
}

function RuleCard(): RuleCard {
    return {
        rawText: "",
        errorText: null,
        lastParsed: null,
        ruleCardHeight: 123, // to be overwritten once page is constructed
    }
}

// Group whole connected components or (if a rule hasn't been parsed yet) a single rule card.
type ColumnItem = Component | RuleCard

function isComponent(item: ColumnItem): item is Component {
    return (item as RuleCard).rawText === undefined
}

interface Column {
    readonly index: number
    readonly items: ColumnItem[]
}

interface State {
    readonly ruleCard: RuleCard[]
    selectedRule: RuleCard | null
// derived state:
    readonly ruleGraph: RuleGraphInfo<RuleCard> // determined by analysis of parsed rules
    readonly ruleLayoutInfo: Map<RuleCard, Column> // determined from graph info
    readonly groupsWithInternalNegation: {errorText: string}[] // TODO: include this in RuleGraphInfo
}

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        ruleCard: [],
        selectedRule: null,
        // Derived state (to be overwritten):
        ruleGraph: {} as RuleGraphInfo<RuleCard>,
        ruleLayoutInfo: new Map<RuleCard, Column>(),
        groupsWithInternalNegation: [],
    }
    return withDerivedProps<State>(essentialState, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        ruleGraph: state => {
            // IMPORTANT: all proxied (i.e. state) objects which will be tested for equality in the future
            // must be inserted into an existing proxied object so that they are not "double-proxied" when
            // their parent is later wrapped in observable(). Rules are tested for equality in Map.get().
            const rawRules = observable(new Map<Rule, RuleCard>())
            state.ruleCard.forEach(r => {
                if (r.lastParsed !== null) {
                    rawRules.set(r.lastParsed.rule, r)
                }
            })
            return analyseRuleGraph(rawRules)
        },
        ruleLayoutInfo: state => {
            // IMPORTANT: all proxied (i.e. state) objects which will be tested for equality in the future
            // must be inserted into an existing proxied object so that they are not "double-proxied" when
            // their parent is later wrapped in observable(). Rules are tested for equality in Map.get().
            const layoutInfo = observable(new Map<RuleCard, Column>())

            // Assign the rule (and its whole component, if exists) to the given column
            function assignRuleToColumn(ruleCard: RuleCard, column: Column): void {
                if (ruleCard.lastParsed === null) { // Display the incomplete rule card by itself
                    column.items.push(ruleCard)
                    layoutInfo.set(ruleCard, column)
                }
                else { // Display the entire component alongside the given rule
                    const rule = ruleCard.lastParsed.rule
                    const relation = state.ruleGraph.relations.get(rule.head.relationName) as Relation
                    const component = state.ruleGraph.components.get(relation) as Component
                    column.items.push(component)
                    for (const relation of component) {
                        for (const rule of relation.rules) {
                            const ruleCard = state.ruleGraph.rules.get(rule) as RuleCard
                            layoutInfo.set(ruleCard, column)
                        }
                    }
                }
            }

            // Put the selected rule into its own column
            if (state.selectedRule !== null) {
                const column = observable({index: 0, items: []})
                assignRuleToColumn(state.selectedRule, column)
            }
            // Put everything else into a single column
            const defaultColumn = observable({index: 1, items: []})
            state.ruleCard.forEach(r => {
                if (layoutInfo.has(r)) return
                assignRuleToColumn(r, defaultColumn)
            })
            return layoutInfo
        },
        groupsWithInternalNegation: state => {
            return []
            // TODO: Replace this with an analysis of the RuleGraph within the Semantics module
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

// Define the serialization of Maps to JSON.
// UNFORTUNATELY, JSON-decycle doesn't support de-cycling Sets and Maps,
// so being able to (de-)serialize them is not sufficient.

// declare global {
//     interface Map<K, V> {
//         toJSON(): any[]
//     }
//     interface Set<T> {
//         toJSON(): any[]
//     }
// }

// const mapTypeMarker = "$Map()$"
// const setTypeMarker = "$Set()$"

// Map.prototype.toJSON = function() {
//     const array: any[] = Array.from(this.entries())
//     array.push(mapTypeMarker) // mark this array as a Map type
//     return array
// }

// Set.prototype.toJSON = function() {
//     const array: any[] = Array.from(this.keys())
//     array.push(setTypeMarker) // mark this array as a Set type
//     return array
// }

// // Identify which serialized arrays were actually Maps and Sets,
// // and reconstruct them.
// function parseMapsAndSets(key: string, value: any): any {
//     if (Array.isArray(value) && value.length > 0) {
//         const lastValue = value[value.length-1]
//         if (lastValue === mapTypeMarker) {
//             return new Map(value.slice(0, -1))
//         } else if (lastValue === setTypeMarker) {
//             return new Set(value.slice(0, -1))
//         }
//         else return value
//     }
//     else {
//         return value
//     }
// }

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
        (document.activeElement as unknown as HTMLInputElement).blur()
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
    state.ruleCard.push(RuleCard())
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

function px(n: number): string {
    return `${n}px`
}

function percent(n: number): string {
    return `${n}%`
}

const ruleCardWidth = 30 // WARNING: Keep this in sync with the CSS file
const ruleCardXOffset = ruleCardWidth + 2.5
// As pixels:
const ruleCardYSpacing = 30

function computeLeftPosition(rule: RuleCard): string {

    const column = state.ruleLayoutInfo.get(rule)
    return column === undefined ? px(-123): percent(1 + column.index * ruleCardXOffset)
}

function computeTopPosition(thisRuleCard: RuleCard): string {
    const column = state.ruleLayoutInfo.get(thisRuleCard)
    if (column === undefined) {
        return px(-123) // should never happen
    }
    else {
        let y = 0
        // Get the rule for this card, if it exists, so
        // we can attempt to find it within the column.
        let thisRule: Rule | undefined = undefined
        if (thisRuleCard.lastParsed !== null) {
            thisRule = thisRuleCard.lastParsed.rule
        }
        // Scan down the column until we find the entry for this rule
        // card, calculating the y-distance to the card as we go.
        for (const item of column.items) {
            if (isComponent(item)) {
                for (const relation of item) {
                    for (const rule of relation.rules) {
                        if (rule === thisRule) {
                            return px(y)
                        }
                        else {
                            const ruleCard = state.ruleGraph.rules.get(rule) as RuleCard
                            y += ruleCard.ruleCardHeight
                        }
                    }
                }
            }
            else if (item === thisRuleCard) {
                return px(y)
            }
            else {
                y += item.ruleCardHeight
            }
            // Put space between components
            y += ruleCardYSpacing
        }
        // We should never reach here
        return px(-123)
    }
}

// When new rule cards are created, observe and record their height.
// We need this to enable JS-driven layout.
// We also re-record card height during every oninput() event of a rule's text area.
const observer = new MutationObserver(mutations => {
    // Traverse the ENTIRE tree of added nodes to check for a "rule" node.
    let foundRule = false
    function findRule(el: HTMLElement) {
        if (el.className === "rule") {
            (el as any)["data-1"].ruleCardHeight = el.offsetHeight
            foundRule = true
        }
        else if (el.children !== undefined) {
            for (let j = 0; j < el.children.length; ++j) {
                findRule(el.children[j] as HTMLElement)
            }
        }
    }
    mutations.forEach(mutation => {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
            const el = mutation.addedNodes[i] as HTMLElement
            findRule(el)
        }
    })
    if (foundRule) {
        // Create a new DOM update to apply the effect of the new ruleCardHeight(s)
        defineDOMUpdate(() => { /* no work to do */ })({
            type: "Custom update",
            target: null,
        })
    }
})
observer.observe(document, { childList: true, subtree: true })

app ("app", state,
    div ({class: "view"}, [
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
            $set (() => new Set(state.ruleLayoutInfo.keys()), ruleCard => [
                div ({
                    class: "rule",
                    left: () => computeLeftPosition(ruleCard),
                    top: () => computeTopPosition(ruleCard),
                    "data-1": ruleCard,
                }, [
                    button ("✖", {
                        class: "deleteRuleButton",
                        onclick: () => {
                            if (ruleCard === state.selectedRule) {
                                state.selectedRule = null
                            }
                            state.ruleCard.removeAt(state.ruleCard.indexOf(ruleCard))
                        },
                    }),
                    div ({class: "ruleTextWithErrors"}, [
                        textarea ({
                            class: "ruleTextArea",
                            value: toRefs(ruleCard).rawText,
                            onfocus: () => {
                                state.selectedRule = ruleCard
                            },
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
                                            el.selectionStart >= 1 && ruleCard.rawText[el.selectionStart-1] === "\n"
                                        ) && !(
                                            el.selectionStart > 1 && ruleCard.rawText[el.selectionStart-2] === "\n"
                                        ) && (
                                            (el.selectionStart >= 1 && ruleCard.rawText[el.selectionStart-1] === " ") || (el.selectionEnd < ruleCard.rawText.length && ruleCard.rawText[el.selectionEnd] === " ")
                                        )
                                    ) {
                                        event.preventDefault()
                                    }
                                }
                            },
                            oninput: (event: Event) => {
                                const el = (event.target as HTMLTextAreaElement)
                                const parseResult = parseRule(ruleCard.rawText)
                                if (parseResult.result === "success") {
                                    ruleCard.lastParsed = {
                                        rawText: ruleCard.rawText,
                                        rule: parseResult.rule,
                                    }
                                    ruleCard.errorText = null
                                }
                                else if (parseResult.result === "noRule") {
                                    ruleCard.lastParsed = null
                                    ruleCard.errorText = null
                                }
                                else {
                                    ruleCard.errorText = parseResult.reason
                                }

                                const ruleDiv = el.parentElement?.parentElement as HTMLElement
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
                                        ruleCard.ruleCardHeight = ruleDiv.offsetHeight
                                    })({
                                        type: "Custom update",
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
                        $if (() => ruleCard.errorText !== null, {
                            $then: () => [
                                p (() => ruleCard.errorText as string, {
                                    class: "errorText",
                                }),
                            ],
                            $else: () => [],
                        }),
                    ]),
                ]),
            ]),
        ]),
        div ({class: "separator"}),
        div ({class: "viewBottomPadding"}),
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
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
// stuff for layout
    ruleCardHeight: number
    newlyDisplayed: boolean
}

function RuleCard(): RuleCard {
    return {
        rawText: "",
        errorText: null,
        lastParsed: null,
        ruleCardHeight: 123, // to be overwritten once page is constructed
        newlyDisplayed: false,
    }
}

// Group whole connected components or (if a rule hasn't been parsed yet) a single rule card.
type ColumnItem = Component | RuleCard

function isComponent(item: ColumnItem): item is Component {
    return (item as RuleCard).rawText === undefined
}

interface ColumnLayout {
    index: number
    hidden: boolean // If true, h-align with the column index but transition column off screen
    readonly items: Set<ColumnItem> // Intend to iterate in an ordered manner, but discard duplicates
}

interface State {
    readonly ruleCards: RuleCard[]
    selectedRule: RuleCard | null
    lastRuleLayoutInfo: Map<RuleCard, ColumnLayout> // cached so we can base next layout on last layout
// derived state:
    readonly ruleGraph: RuleGraphInfo<RuleCard> // determined by analysis of parsed rules
    readonly incompleteCards: RuleCard[]
    readonly ruleLayoutInfo: Map<RuleCard, ColumnLayout> // determined from graph info
    readonly groupsWithInternalNegation: {errorText: string}[] // TODO: include this in RuleGraphInfo
}

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        ruleCards: [],
        selectedRule: null,
    }
    let lastRuleLayoutInfo = new Map<RuleCard, ColumnLayout>()
    Object.defineProperty(essentialState, "lastRuleLayoutInfo", {
        get() {return lastRuleLayoutInfo },
        set(v: Map<RuleCard, ColumnLayout>) { lastRuleLayoutInfo = v },
        enumerable: true, // This property can be serialized
    })
    return withDerivedProps<State>(essentialState as State, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        ruleGraph: state => {
            // IMPORTANT: all proxied (i.e. state) objects which will be tested for equality in the future
            // must be inserted into an existing proxied object so that they are not "double-proxied" when
            // their parent is later wrapped in observable(). Rules are tested for equality in Map.get().
            const rawRules = observable(new Map<Rule, RuleCard>())
            state.ruleCards.forEach(r => {
                if (r.lastParsed !== null) {
                    rawRules.set(r.lastParsed.rule, r)
                }
            })
            return analyseRuleGraph(rawRules)
        },
        incompleteCards: state => {
            return state.ruleCards.filter(card => card.lastParsed === null)
        },
        ruleLayoutInfo: state => {
            // Gather the cards that were visible at the last timestep.
            // We'll work out which of these are no longer visible, and animate them away.
            const outgoingCards = new Set<RuleCard>()
            state.lastRuleLayoutInfo.forEach((column, card) => {
                if (!column.hidden) outgoingCards.add(card)
            })
            // Track which cards are newly displayed: we'll ensure they animate onto the screen.
            const incomingCards = new Set<RuleCard>()
            setTimeout(() => {
                // After this DOM update is complete, and the new cards have been added
                // to the page, commence their animation by triggering a second DOM update.
                incomingCards.forEach(card => {
                    card.newlyDisplayed = false
                })
                defineDOMUpdate(() => { /* no work to do */ })({
                    type: "Custom update",
                    target: null,
                })
            }, 0)
            // IMPORTANT: all proxied (i.e. state) objects which will be tested for equality in the future
            // must be inserted into an existing proxied object so that they are not "double-proxied" when
            // their parent is later wrapped in observable(). Rules are tested for equality in Map.get().
            const layoutInfo = observable(new Map<RuleCard, ColumnLayout>())

            // Assign the rule (and its whole component, if exists) to the given column
            function assignComponentToColumn(component: Component, column: ColumnLayout): void {
                if (!column.items.has(component)) {
                    column.items.add(component)
                    for (const relation of component) {
                        for (const rule of relation.ownRules) {
                            const ruleCard = state.ruleGraph.rules.get(rule) as RuleCard
                            layoutInfo.set(ruleCard, column)
                            if (state.lastRuleLayoutInfo.has(ruleCard)) {
                                outgoingCards.delete(ruleCard)
                            }
                            else {
                                ruleCard.newlyDisplayed = true
                                incomingCards.add(ruleCard)
                            }
                        }
                    }
                }
            }

            if (state.selectedRule !== null) {
                // Put the selected rule's component into its own column
                const selectedComponentColumn: ColumnLayout = observable({index: 1, hidden: false, items: new Set()})
                if (state.selectedRule.lastParsed === null) {
                    const ruleCard = state.selectedRule
                    selectedComponentColumn.items.add(ruleCard)
                    layoutInfo.set(ruleCard, selectedComponentColumn)
                    if (state.lastRuleLayoutInfo.has(ruleCard)) {
                        outgoingCards.delete(ruleCard)
                    }
                    else {
                        ruleCard.newlyDisplayed = true
                        incomingCards.add(ruleCard)
                    }
                }
                else {
                    const selectedRule = state.selectedRule.lastParsed.rule
                    const selectedRelation = state.ruleGraph.relations.get(selectedRule.head.relationName) as Relation
                    const selectedComponent = state.ruleGraph.components.get(selectedRelation) as Component
                    assignComponentToColumn(selectedComponent, selectedComponentColumn)
                    // Put dependencies and dependent components into adjacent columns
                    const dependenciesColumn: ColumnLayout = observable({index: 2, hidden: false, items: new Set()})
                    const dependentsColumn: ColumnLayout = observable({index: 0, hidden: false, items: new Set()})
                    selectedComponent.forEach(relation => {
                        // Dependents
                        relation.dependentRules.forEach(succRule => {
                            const succCard = state.ruleGraph.rules.get(succRule) as RuleCard
                            if (!layoutInfo.has(succCard)) {
                                const succRelation = state.ruleGraph.relations.get(succRule.head.relationName) as Relation
                                const succComponent = state.ruleGraph.components.get(succRelation) as Component
                                if (!selectedComponentColumn.items.has(succComponent)) {
                                    assignComponentToColumn(succComponent, dependentsColumn)
                                }
                            }
                        })
                        // Dependencies
                        relation.ownRules.forEach(ownRule => {
                            ownRule.body.forEach(lit => {
                                const predRelation = state.ruleGraph.relations.get(lit.relationName) as Relation
                                const predComponent = state.ruleGraph.components.get(predRelation) as Component
                                if (!selectedComponentColumn.items.has(predComponent)) {
                                    assignComponentToColumn(predComponent, dependenciesColumn)
                                }
                            })
                        })
                    })
                }
            }
            // Transition outgoing cards
            outgoingCards.forEach(card => {
                const column = state.lastRuleLayoutInfo.get(card)
                if (column !== undefined) {
                    column.hidden = true
                    if (column.index === 0) column.index = -1
                    else if (column.index === 2) column.index = 3
                    layoutInfo.set(card, column)
                }
            })
            state.lastRuleLayoutInfo = layoutInfo
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
localStorage.saveState = true

function saveState(): void {
    if (localStorage.saveState === "false") return
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
    state.ruleCards.push(RuleCard())
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

// As percentages:
const ruleCardWidth = 30 // WARNING: Keep this in sync with the CSS file
const ruleCardSpacing = 2.5
const ruleCardXOffset = ruleCardWidth + ruleCardSpacing
// As pixels:
const ruleCardYSpacing = 30

function computeLeftPosition(card: RuleCard): string {
    const column = state.ruleLayoutInfo.get(card)
    if (column === undefined) {
        return px(-123)
    }
    else {
        let index: number
        if (card.newlyDisplayed) {
            // Animate inwards from one side of the screen
            if (column.index === 0) {
                index = -1
            }
            else if (column.index === 1) {
                index = 1
            }
            else { // if (column.index === 2)
                index = 3
            }
        }
        else index = column.index
        return percent(ruleCardSpacing + index * ruleCardXOffset)
    }  
}

function computeTopPosition(thisRuleCard: RuleCard): string {
    const column = state.ruleLayoutInfo.get(thisRuleCard)
    if (column === undefined) {
        return px(-123) // should never happen
    }
    else if (column.hidden || thisRuleCard.newlyDisplayed) {
        // Hide the card above the view
        return px(-2 * thisRuleCard.ruleCardHeight)
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
                    for (const rule of relation.ownRules) {
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

function computeZIndex(card: RuleCard) {
    const column = state.ruleLayoutInfo.get(card)
    if (column?.hidden === true) {
        return 0 // render behind
    }
    else {
        return 100 // render in-front (magnitude > 1 needed for animation purposes)
    }
}

function overviewColor(card: RuleCard): string {
    // selected
    if (card === state.selectedRule) {
        return "#55dd55"
    }
    // visible
    else if (state.ruleLayoutInfo.get(card)?.hidden === 
    false) {
        return "#ffffff"
    }
    // not visible
    else return "#bbbbbb"
}

// When new rule cards are created, observe and record their height.
// We need this to enable JS-driven layout.
// We also re-record card height during every oninput() event of a rule's text area.
const observer = new MutationObserver(mutations => {
    // We need to set the height of the cards' text areas first, before we can measure card height.
    // It's too much work to traverse the DOM trees to find each text area,
    // so grab them by class name and conservatively set all of their heights.
    const textAreas = document.getElementsByClassName("ruleTextArea")
    for (let i = 0; i < textAreas.length; i++) {
        (textAreas[i] as HTMLElement).style.height = textAreas[i].scrollHeight + "px"
    }
    // Traverse the ENTIRE tree of added nodes to check for rule nodes,
    // measuring the height of each one.
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
        div ({class: "row"}, [
            div ({class: "ruleOverview"}, [
                button ("Add rule", {
                    class: "addRuleButton",
                    onclick: newRule,
                }),
                div ({class: "ruleList"}, [
                    $for (() => state.ruleCards, card => [
                        div ({}, [
                            p (() => card.lastParsed === null ? "incomplete" : card.lastParsed.rule.head.relationName, {
                                "background-color": () => overviewColor(card),
                                onclick: () => state.selectedRule = card,
                            }),

                        ]),
                    ]),
                ]),
            ]),
            div ({class: "rightPane"}, [
                div ({class: "ruleGraphView"}, [
                    $set (() => new Set(state.ruleLayoutInfo.keys()), ruleCard => [
                        div ({
                            class: "ruleShadow",
                            "z-index": () => computeZIndex(ruleCard),
                            left: () => computeLeftPosition(ruleCard),
                            top: () => computeTopPosition(ruleCard),
                            height: () => `${ruleCard.ruleCardHeight}px`,
                        }),
                        div ({
                            class: "rule",
                            "z-index": () => computeZIndex(ruleCard),
                            left: () => computeLeftPosition(ruleCard),
                            top: () => computeTopPosition(ruleCard),
                            "data-1": ruleCard,
                        }, [
                            button ("✖", {
                                class: "deleteRuleButton",
                                visibility: () => state.selectedRule === ruleCard ? "visible" : "hidden",
                                onclick: () => {
                                    if (ruleCard === state.selectedRule) {
                                        state.selectedRule = null
                                    }
                                    state.ruleCards.removeAt(state.ruleCards.indexOf(ruleCard))
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
                div ({class: "dataView"}, [
                    h1("data"),
                ]),
            ]),
        ]),
        div ({class: "viewBottomPadding"}),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

//#endregion
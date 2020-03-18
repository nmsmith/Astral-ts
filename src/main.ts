import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs, reactive as observable } from "@vue/reactivity"
import { WithDerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import { h1, h3, $if, $for, makeObjSeq, app, div, p, button, textarea, span, list, $set, defineDOMUpdate, img, input } from "./libs/lib-view"
import {parseRule} from "./parser"
import {Rule, analyseRuleGraph, Component, RuleGraphInfo, Relation, componentOf, computeDeductions, Deduction, Tuple } from "./semantics"

//#region  --- Essential & derived state ---

interface RuleCard {
    readonly rawText: string
    parseErrorText: string | null
    lastParsed: null | {
        readonly rawText: string
        readonly rule: Rule
    }
// stuff for layout
    newlyDisplayed: boolean
    cardHeightUnselected: number
// derived properties
    cardHeight: number
    isCentered: boolean
}

function RuleCard(): RuleCard {
    return {
        rawText: "",
        parseErrorText: null,
        lastParsed: null,
        newlyDisplayed: false,
        cardHeightUnselected: 123, // to be overwritten once page is constructed
    } as RuleCard
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

const leftOffscreenColumn = -1.125
const rightOffscreenColumn = 3.125

interface State {
// Essential, persisted state. MUST be primitive data types (no Sets or Maps).
    readonly ruleCards: RuleCard[]
// Essential, but don't serialize these (because they're unserializable, for the mostpart)
    // WARNING: this holds onto derived state, and thus needs to be refreshed whenever ruleCards changes
    centeredItem: ColumnItem | null
    editingRule: RuleCard | null
    lastRuleLayoutInfo: Map<RuleCard, ColumnLayout> // cached so we can base next layout on last layout
// Derived state
    readonly ruleGraph: RuleGraphInfo<RuleCard> // determined by analysis of parsed rules
    readonly deductions: Deductions
    readonly incompleteCards: RuleCard[]
    readonly ruleLayoutInfo: Map<RuleCard, ColumnLayout> // determined from graph info
}

const selectedCardMinHeight = 158

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        ruleCards: [],
    }
    function createUnserializableState<T>(propName: string, initialValue: T): void {
        let value = initialValue
        Object.defineProperty(essentialState, propName, {
            get() {return value },
            set(v: T) { value = v },
            enumerable: false, // Prevent this property from being serialized
        })
    }
    createUnserializableState("centeredItem", null)
    createUnserializableState("editingRule", null)
    createUnserializableState("lastRuleLayoutInfo", new Map<RuleCard, ColumnLayout>())

    return withDerivedProps<State>(essentialState as State, {
        ruleCards: {
            cardHeight: (card: RuleCard): number => {
                if (state.editingRule === card) {
                    return Math.max(card.cardHeightUnselected, selectedCardMinHeight)
                }
                else {
                    return card.cardHeightUnselected
                }
            },
            isCentered: (card: RuleCard): boolean => {
                if (card.lastParsed === null) {
                    return state.centeredItem === card
                }
                else {
                    return state.centeredItem === componentOf(card.lastParsed.rule, state.ruleGraph)
                }
            },
        },
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
        deductions: state => {
            return computeDeductions(state.ruleGraph)
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

            if (state.centeredItem !== null) {
                // Put the centered rule/component into the middle column
                const selectedComponentColumn: ColumnLayout = observable({index: 1, hidden: false, items: new Set()})
                if (state.centeredItem !== null && isComponent(state.centeredItem)) {
                    const selectedComponent = state.centeredItem
                    assignComponentToColumn(selectedComponent, selectedComponentColumn)
                    // Put dependencies and dependent components into adjacent columns
                    const dependenciesColumn: ColumnLayout = observable({index: 2, hidden: false, items: new Set()})
                    const dependentsColumn: ColumnLayout = observable({index: 0, hidden: false, items: new Set()})
                    selectedComponent.forEach(relation => {
                        // Dependents
                        relation.dependentRules.forEach(succRule => {
                            const succCard = state.ruleGraph.rules.get(succRule) as RuleCard
                            if (!layoutInfo.has(succCard)) {
                                const succComponent = componentOf(succRule, state.ruleGraph)
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
                else { // an INCOMPLETE rule is centered, so it will be the only thing in the column
                    const ruleCard = state.centeredItem
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
            }
            // Transition outgoing cards
            outgoingCards.forEach(card => {
                const column = state.lastRuleLayoutInfo.get(card)
                if (column !== undefined) {
                    column.hidden = true
                    if (column.index === 0) column.index = leftOffscreenColumn
                    else if (column.index === 2) column.index = rightOffscreenColumn
                    layoutInfo.set(card, column)
                }
            })
            state.lastRuleLayoutInfo = layoutInfo
            return layoutInfo
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
    const newRuleCard = RuleCard()
    state.ruleCards.push(newRuleCard)
    state.centeredItem = newRuleCard
}

function getUnboundVariables(card: RuleCard): Set<string> {
    if (card.lastParsed !== null) {
        return card.lastParsed.rule.unboundVariables
    }
    else return new Set()
}

function getInternalReferences(card: RuleCard): Set<number> {
    if (card.lastParsed !== null) {
        const refs = state.ruleGraph.internalReferences.get(card.lastParsed.rule)
        if (refs === undefined) {
            return new Set()
        }
        else {
            return refs
        }
    }
    else return new Set()
}

function getInternalNegations(card: RuleCard): Set<number> {
    if (card.lastParsed !== null) {
        const refs = state.ruleGraph.internalNegations.get(card.lastParsed.rule)
        if (refs === undefined) {
            return new Set()
        }
        else {
            return refs
        }
    }
    else return new Set()
}

function getDeductions(card: RuleCard): Set<Deduction> {
    if (card.lastParsed !== null) {
        const refs = state.deductions.get(card.lastParsed.rule)
        if (refs === undefined) {
            return new Set()
        }
        else {
            return refs
        }
    }
    else return new Set()
}

function hasError(card: RuleCard): boolean {
    return (card.parseErrorText !== null
        || getUnboundVariables(card).size > 0
        || getInternalNegations(card).size > 0
    )
}

function getError(card: RuleCard): string {
    if (card.parseErrorText !== null) {
        return card.parseErrorText
    }
    else {
        let errorText = ""
        const unboundVariables = getUnboundVariables(card)
        const internalNegations = getInternalNegations(card)
        if (unboundVariables.size > 0) {
            let errorVars = ""
            for (const v of unboundVariables) {
                errorVars += `${v}, `
            }
            errorText += `Unbound variables: ${errorVars.slice(0, -2)}.`
            if (internalNegations.size > 0) errorText += "\n"
        }
        if (internalNegations.size > 0) {
            let errorLines = ""
            for (const index of internalNegations) {
                errorLines += `${index+1}, `
            }
            errorText += `Internal negation on premise ${errorLines.slice(0, -2)}.`
        }
        return errorText
    }
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

function calc(percent: number, pixDiff: number): string {
    if (pixDiff >= 0) {
        return `calc(${percent}% + ${pixDiff}px)`
    }
    else {
        return `calc(${percent}% - ${-pixDiff}px)`
    }
}

const dataShownWidth = 140 //px
const dataHiddenWidth = 28 //px
const dataPaneWidthChange = dataShownWidth - dataHiddenWidth
const oneThird = 100 / 3 //percent
const ruleCardXSpacing = 16 //px
const shrinkForXSpacing = 16 * 4 / 3 //px (the amount each card needs to shrink in width)
const ruleCardYStart = 16 //px
const ruleCardYSpacing = 30 //px
const dataTuckBarHeight = 26 // annoyingly, we have to hardcode this

function computeWidth(card: RuleCard): string {
    if (card.isCentered) {
        return calc(oneThird, dataPaneWidthChange * 2 / 3 - shrinkForXSpacing)
    }
    else {
        return calc(oneThird, -dataPaneWidthChange / 3 - shrinkForXSpacing)
    }
}

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
                index = leftOffscreenColumn
            }
            else if (column.index === 1) {
                index = 1
            }
            else { // if (column.index === 2)
                index = rightOffscreenColumn
            }
        }
        else index = column.index
        if (index === 0) {
            return px(ruleCardXSpacing)
        }
        else if (index === 1) {
            return calc(oneThird, ruleCardXSpacing * 2 - dataPaneWidthChange / 3 - shrinkForXSpacing)
        }
        else if (index === 2) {
            return calc(2 * oneThird, ruleCardXSpacing * 3 + dataPaneWidthChange / 3 - 2 * shrinkForXSpacing)
        }
        else { // offscreen column
            return percent(index * oneThird)
        }
    }  
}

function computeTopPosition(thisRuleCard: RuleCard): string {
    const column = state.ruleLayoutInfo.get(thisRuleCard)
    if (column === undefined) {
        return px(-123) // should never happen
    }
    else if (column.index === 1 && (thisRuleCard.newlyDisplayed || column.hidden)) {
        // Hide the card above the view
        return px(-2 * thisRuleCard.cardHeight)
    }
    else {
        let y = ruleCardYStart
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
                            y += ruleCard.cardHeight
                        }
                    }
                }
            }
            else if (item === thisRuleCard) {
                return px(y)
            }
            else {
                y += item.cardHeight
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

function overviewColor(item: ColumnItem): string {
    const errorColor = "#ffbfbf"
    const centeredColor = "#ffff44"
    const visibleColor = "#ffffff"
    const notVisibleColor = "#cccccc"
    // Highest priority color is highlighting to indicate selection
    if (item === state.centeredItem) {
        return centeredColor
    }
    // Second priority: whether the item has an error.
    if (!isComponent(item)) {
        if (hasError(item)) return errorColor
    }
    else {
        for (const relation of item) {
            for (const rule of relation.ownRules) {
                const ruleCard = state.ruleGraph.rules.get(rule) as RuleCard
                if (hasError(ruleCard)) return errorColor
            }
        }
    }
    // Lowest priority: color based on visibility.
    if (isComponent(item)) {
        const firstRule: Rule = item.size > 0
            ? item.values().next().value.ownRules.values().next().value
            : undefined
        const ruleCard = state.ruleGraph.rules.get(firstRule) as RuleCard
        // visible
        if (state.ruleLayoutInfo.get(ruleCard)?.hidden === 
        false) {
            return visibleColor
        }
    }
    // not visible
    return notVisibleColor
}

function overviewTextForIncompleteCard(card: RuleCard): string {
    // TODO: This criteria for showing incomplete text is probably silly.
    // We want cards to only be considered incomplete/not display with their component
    // if they don't even have a sensible predicate name.
    
    // show the first line of text only
    const candidateText = card.rawText.split("\n")[0].split(":")[0].trim()
    const maxShownLength = 12
    if (candidateText.length === 0) {
        return "empty"
    }
    else if (candidateText.length <= maxShownLength) {
        return candidateText
    }
    else {
        return candidateText.slice(0, maxShownLength - 3) + "…"
    }
}

function tupleToString(tuple: Tuple): string {
    let s = ""
    for (const value of tuple) {
        s += `${value}, `
    }
    return s.slice(0, -2)
}

function forRange(start: number, end: number | undefined): {value: number}[] {
    if (end === undefined) return []
    const result = []
    for (let i = start; i < end; ++i) {
        result.push({value: i})
    }
    return result
}

// When new rule cards are created, observe and record their height.
// We need this to enable JS-driven layout.
// We also re-record card height during every oninput() event of a rule's text area.
const observer = new MutationObserver(mutations => {
    // We need to set the height of the cards' text areas first, before we can measure card height.
    // It's too much work to traverse the DOM trees to find each text area,
    // so grab them by class name and conservatively set all of their heights.
    const textAreas = document.getElementsByClassName("ruleCardTextArea")
    for (let i = 0; i < textAreas.length; i++) {
        (textAreas[i] as HTMLElement).style.height = textAreas[i].scrollHeight + "px"
    }
    // Traverse the ENTIRE tree of added nodes to check for rule nodes,
    // measuring the height of each one.
    let foundRule = false
    function findRule(el: HTMLElement) {
        if (el.className?.split(" ").indexOf("ruleCodeSide") >= 0) {
            (el as any)["data-1"].cardHeightUnselected = el.offsetHeight + dataTuckBarHeight
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
            h3 ("Keep interactions tablet-friendly (material design, drag to resize...). Working on a program can be a kinesthetic experience."),
            h3 ("Information design: show the data, and show comparisons."),
            h3 ("The neighbourhood of an element should always be visible, so that the effects of incremental changes are obvious (Lean on video games e.g. Factorio: inherently local cause-and-effect)."),
            h3 ("Andy Matuschak (his notes): we learn SKILLS and UNDERSTANDING through doing, and observing/mimicking the tacit knowledge of \"experts\" (craftsmen, Twitch streamers, lecturers explaining)."),
            h3 ("But how do we develop NEW APPROACHES to (as opposed to understanding of) a problem/task? First, gain a MASTERFUL UNDERSTANDING of the existing problem & approaches, and then develop approaches from there (e.g. reasoning by first principles)."),
            h3 ("As I keep re-discovering, graphs are crap, and there is no \"magic\" visualisation waiting to be invented. What core visual primitives can communicate data and their relationships? Relative positioning, shape and colour matching... Review literature."),
        ]),
        div ({class: "row"}, [
            div ({class: "ruleOverview"}, [
                button ("Add rule", {
                    class: "addRuleButton",
                    onclick: newRule,
                }),
                div ({class: "componentList"}, [
                    $for (() => state.ruleCards.filter(c => c.lastParsed === null), card => [
                        div ({
                            class: "component",
                            "background-color": () => overviewColor(card),
                            onclick: () => state.centeredItem = card,
                        }, [
                            p (() => overviewTextForIncompleteCard(card), {
                                class: "incompleteCardSummaryText",
                            }),
                        ]),
                    ]),
                    // Iterate over the UNIQUE components stored in the component Map
                    $for (() => new Set(state.ruleGraph.components.values()).values(), component => [
                        div ({
                            class: "component",
                            "background-color": () => overviewColor(component),
                            onclick: () => state.centeredItem = component,
                        }, [
                            $for (() => component.values(), relation => [
                                p (relation.name),
                            ]),
                        ]),
                    ]),
                ]),
            ]),
            div ({class: "rightPane"}, [
                div ({class: "ruleGraphView"}, [
                    $set (() => new Set(state.ruleLayoutInfo.keys()), ruleCard => [
                        div ({
                            class: "ruleCardShadow",
                            "z-index": () => computeZIndex(ruleCard) - 1, // render behind cards
                            left: () => computeLeftPosition(ruleCard),
                            top: () => computeTopPosition(ruleCard),
                            width: () => computeWidth(ruleCard),
                            height: () => `${ruleCard.cardHeight}px`,
                        }),
                        div ({
                            class: () => `ruleCard ${
                                hasError(ruleCard)
                                ? "ruleCardError"
                                : ""
                            }`,
                            "z-index": () => computeZIndex(ruleCard),
                            left: () => computeLeftPosition(ruleCard),
                            top: () => computeTopPosition(ruleCard),
                            width: () => computeWidth(ruleCard),
                            height: () => `${ruleCard.cardHeight}px`,
                        }, [
                            div ({class: "ruleCardBody"}, [
                                // Computed conclusions
                                div ({
                                    class: "ruleDataSide",
                                    width: () => ruleCard.isCentered ? px(dataShownWidth) : px(dataHiddenWidth),
                                }, [
                                    div ({class: "dataSearchBar"}, [
                                        img ("./glass-short.svg", {
                                            class: "dataSearchIcon",
                                        }),
                                        input ({class: "dataSearchBox"}),
                                    ]),
                                    div ({
                                        class: "dataScrollPane",
                                    }, [
                                        $for (() => getDeductions(ruleCard).values(), deduction => [
                                            div ({
                                                class: "data",
                                                color: () => ruleCard.isCentered ? "black" : "transparent",
                                            }, [
                                                p (tupleToString(deduction.deduction)),
                                            ]),
                                        ]),
                                    ]),
                                ]),
                                div ({
                                    class: "ruleCodeSide",
                                    "data-1": ruleCard, // needed elsewhere for JS-driven layout
                                }, [
                                    div ({class: "ruleCardTextWrapper"}, [
                                        // Rule text
                                        textarea ({
                                            class: "ruleCardTextArea",
                                            value: toRefs(ruleCard).rawText,
                                            onfocus: () => {
                                                state.editingRule = ruleCard
                                                if (ruleCard.lastParsed !== null) {
                                                    state.centeredItem = componentOf(ruleCard.lastParsed.rule, state.ruleGraph)
                                                }
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
                                                    ruleCard.parseErrorText = null
                                                    // Center the component of the newly parsed rule
                                                    state.centeredItem = componentOf(ruleCard.lastParsed.rule, state.ruleGraph)
                                                }
                                                else if (parseResult.result === "noRule") {
                                                    ruleCard.lastParsed = null
                                                    ruleCard.parseErrorText = null
                                                    // Center just this rule card as a component
                                                    state.centeredItem = ruleCard
                                                }
                                                else {
                                                    ruleCard.parseErrorText = parseResult.reason
                                                }
                
                                                const codeDiv = el.parentElement?.parentElement as HTMLElement
                                                el.style.height = "auto"  // trigger the text box to auto-size
                                                el.style.height = el.scrollHeight + "px" // new stretch it to fit contentss
                
                                                // Delay the reading of the rule div height until the
                                                // currently-executing DOM update has fully finished
                                                // (the div's height may change during the update).
                                                setTimeout(() => {
                                                    // Create a new DOM update to finish the work.
                                                    defineDOMUpdate(() => {
                                                        // Record the height of the WHOLE rule div,
                                                        // so we can use it for code-driven layout.
                                                        ruleCard.cardHeightUnselected = codeDiv.offsetHeight + dataTuckBarHeight
                                                    })({
                                                        type: "Custom update",
                                                        target: null,
                                                    })
                                                }, 0)
                                            },
                                        }),
                                    ]),
                                    $if (() => hasError(ruleCard), {
                                        $then: () => [
                                            p (() => getError(ruleCard), {
                                                class: "errorText",
                                            }),
                                        ],
                                        $else: () => [],
                                    }),
                                ]),
                            ]),
                            div ({class: "dataTuckBar"}, [
                                p ("7 tuples", {class: "factCount"}),
                                div ({class: "grow"}),
                                button ("✖", {
                                    class: "deleteCardButton",
                                    visibility: () => state.editingRule === ruleCard ? "visible" : "hidden",
                                    onclick: () => {
                                        state.lastRuleLayoutInfo.delete(ruleCard) // don't animate deletion
                                        const deletionIndex = state.ruleCards.indexOf(ruleCard)
                                        if (state.editingRule === ruleCard) {
                                            state.editingRule = null
                                            // Need to release reference to the old component,
                                            // since it will now be invalid.
                                            state.centeredItem = null
                                            // But now we'll need to find another rule in the old
                                            // component, whose newly-computed component can be centered.
                                            if (ruleCard.lastParsed !== null) {
                                                const myRule = ruleCard.lastParsed.rule
                                                const myRelation = state.ruleGraph.relations.get(myRule.head.relationName) as Relation
                                                const myComponent = state.ruleGraph.components.get(myRelation) as Component
                                                let candidateRuleCard: RuleCard | undefined = undefined
                                                if (myRelation.ownRules.size > 0) {
                                                    // Select another rule in the relation
                                                    for (const rule of myRelation.ownRules) {
                                                        if (rule !== myRule) {
                                                            candidateRuleCard = state.ruleGraph.rules.get(rule) as RuleCard
                                                            break
                                                        }
                                                    }
                                                }
                                                else {
                                                    // Select the first rule from another relation in the component
                                                    for (const relation of myComponent) {
                                                        if (relation !== myRelation && relation.ownRules.size > 0) {
                                                            const rule = relation.ownRules.values().next().value
                                                            candidateRuleCard = state.ruleGraph.rules.get(rule) as RuleCard
                                                            break
                                                        }
                                                    }
                                                }
    
                                                if (candidateRuleCard !== undefined && candidateRuleCard.lastParsed !== null) {
                                                    // Delete the rule card so that new components can be computed
                                                    state.ruleCards.removeAt(deletionIndex)
                                                    // Find the candidate rule's new component, and center it
                                                    state.centeredItem = componentOf(
                                                        candidateRuleCard.lastParsed.rule,
                                                        state.ruleGraph,
                                                    )
                                                    return // finish early, since we already deleted the card
                                                }
                                            }
                                        }
                                        state.ruleCards.removeAt(deletionIndex)
                                    },
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
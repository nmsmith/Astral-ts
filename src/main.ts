import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs, reactive as observable } from "@vue/reactivity"
import { WithDerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import { h1, h3, $if, $for, makeObjSeq, app, div, p, button, textarea, span, list, $set, defineDOMUpdate, img, input, br } from "./libs/lib-view"
import {parseRule} from "./parser"
import {Rule, analyseRuleGraph, Component, RuleGraphInfo, Relation, componentOf, computeDerivations, TupleLookup, Tuple, Derivations, TupleWithDerivations } from "./semantics"

//#region  --- Essential & derived state ---

interface RuleCard {
    readonly rawText: string
    parseErrorText: string | null
    lastParsed: null | {
        readonly rawText: string
        rule: Rule
    }
// stuff for layout
    newlyDisplayed: boolean
    cardHeight: number
// derived properties
    readonly isCentered: boolean
}

function RuleCard(): RuleCard {
    return {
        rawText: "",
        parseErrorText: null,
        lastParsed: null,
        newlyDisplayed: false,
        cardHeight: 123, // to be overwritten once page is constructed
    } as RuleCard
}

// -------------------------- Layout calculation -------------------------

type ColumnViewState = "DataShown" | "DataHidden"

// Group whole connected components or (if a rule hasn't been parsed yet) a single rule card.
type ColumnItem = Component | RuleCard

function isComponent(item: ColumnItem): item is Component {
    return (item as RuleCard).rawText === undefined
}

interface ColumnLayout {
    readonly isRuleColumn: boolean // whether the column is one where rules are visible
    // We align column members to the right edge of their column
    // (since relation banners and rules both sit on this edge).
    readonly right:  string  // as a CSS number (possibly calc())
    readonly width: string  // as a CSS number (possibly calc())
}

interface Column {
    readonly layout: ColumnLayout
    readonly items: Set<ColumnItem>
}

function px(n: number): string { return `${n}px` }
function percent(n: number): string { return `${n}%` }
function calc(percent: number, pixDiff: number): string {
    return (pixDiff >= 0) ? `calc(${percent}% + ${pixDiff}px)` : `calc(${percent}% - ${-pixDiff}px)`
}

const sideBannerWidth = 180 // px   This is the width of the "side bars"
const dataShownWidth = 140 //px   Data column
const dataHiddenWidth = 28 //px
const oneThird = 100 / 3 //percent
const columnSpacing = 16 //px

// Essential, persisted state. MUST be primitive data types (no Sets or Maps).
interface EssentialState {
    readonly ruleCards: RuleCard[]
    readonly columnViewStates: { // from left to right
        dependents: ColumnViewState
        center: ColumnViewState
        dependencies: ColumnViewState
    }
}

// Essential state that shouldn't be serialized, either because it's session-specific
// or (more importantly) CAN'T be serialized for some reason.
interface EssentialStateUnserializable {
    centeredItem: ColumnItem | null // WARNING: this holds derived state, and thus needs to be refreshed whenever ruleCards changes
    editingRule: RuleCard | null
    cachedCardAssignments: Map<RuleCard, Column> // cached so we can base next layout on last layout
}

interface DerivedState {
    readonly ruleGraph: RuleGraphInfo<RuleCard> // determined by analysis of parsed rules
    readonly derivations: Derivations
    readonly incompleteCards: RuleCard[]
    readonly columnLayouts: { // from left to right
        readonly ruleCardWidth: string // this is independent of any column width
        readonly transitiveDependents: ColumnLayout
        readonly dependents: ColumnLayout
        readonly center: ColumnLayout
        readonly dependencies: ColumnLayout
        readonly transitiveDependencies: ColumnLayout
    }
    readonly columnAssignments: {
        readonly card: Map<RuleCard, Column>
        readonly relation: Map<Relation, Column>
    }
    readonly columnYPositions: {
        readonly card: Map<RuleCard, number>
        readonly relation: Map<Relation, number>
    }
}

interface State extends EssentialState, EssentialStateUnserializable, DerivedState {}

function parseRuleCardFromText(card: RuleCard, text: string): void {
    const parseResult = parseRule(text)
    if (parseResult.result === "success") {
        card.lastParsed = {
            rawText: card.rawText,
            rule: parseResult.rule,
        }
        card.parseErrorText = null
    }
    else if (parseResult.result === "noRule") {
        card.lastParsed = null
        card.parseErrorText = null
    }
    else {
        card.parseErrorText = parseResult.reason
    }
}

/* eslint-disable @typescript-eslint/no-use-before-define */
function createState(existingState?: State): WithDerivedProps<State> {
    let essentialState: EssentialState
    if (existingState !== undefined) {
        // Re-parse rule cards, because our "essential" parsed rules are actually derived
        existingState.ruleCards.forEach(card => {
            const sourceText = card.lastParsed === null ? card.rawText : card.lastParsed.rawText
            card.lastParsed = null
            parseRuleCardFromText(card, sourceText)
        })
        essentialState = existingState
    } else {
        essentialState = {
            ruleCards: [],
            columnViewStates: {dependents: "DataHidden", center: "DataShown", dependencies: "DataHidden"},
        }
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
    createUnserializableState("cachedCardAssignments", new Map<RuleCard, Column>())

    return withDerivedProps<State>(essentialState as State, {
        ruleCards: {
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
        derivations: state => {
            return computeDerivations(state.ruleGraph)
        },
        incompleteCards: state => {
            return state.ruleCards.filter(card => card.lastParsed === null)
        },
        columnLayouts: state => {
            function dataBarWidth(s: ColumnViewState): number {
                return (s === "DataShown") ? dataShownWidth : dataHiddenWidth
            }
            // width info
            const dataWidth1 = dataBarWidth(state.columnViewStates.dependencies)
            const dataWidth2 = dataBarWidth(state.columnViewStates.center)
            const dataWidth3 = dataBarWidth(state.columnViewStates.dependents)
            const totalFixedWidth = 2 * sideBannerWidth + 4 * columnSpacing + dataWidth1 + dataWidth2 + dataWidth3
            const fixedWidthLostPerFlexColumn = -totalFixedWidth / 3
            const fixedWidth1 = dataWidth1 + fixedWidthLostPerFlexColumn
            const fixedWidth2 = dataWidth2 + fixedWidthLostPerFlexColumn
            const fixedWidth3 = dataWidth3 + fixedWidthLostPerFlexColumn
            // right info
            const fixedRightOffset3 = sideBannerWidth + columnSpacing
            const fixedRightOffset2 = fixedRightOffset3 + columnSpacing + fixedWidth3
            const fixedRightOffset1 = fixedRightOffset2 + columnSpacing + fixedWidth2
            const fixedRightOffset0 = fixedRightOffset1 + columnSpacing + fixedWidth1
            return {
                ruleCardWidth:
                    calc(oneThird, fixedWidthLostPerFlexColumn),
                transitiveDependents:
                    { isRuleColumn: false, right: calc(100, fixedRightOffset0), width: px(sideBannerWidth) },
                dependents:
                    { isRuleColumn: true,  right: calc(2 * oneThird, fixedRightOffset1), width: calc(oneThird, fixedWidth1) },
                center:
                    { isRuleColumn: true,  right: calc(oneThird, fixedRightOffset2), width: calc(oneThird, fixedWidth2) },
                dependencies:
                    { isRuleColumn: true,  right: px(fixedRightOffset3), width: calc(oneThird, fixedWidth3) },
                transitiveDependencies:
                    { isRuleColumn: false, right: px(0), width: px(sideBannerWidth) },
            }
        },
        columnAssignments: state => {
            // Clone the last layout so we can use it as a point of comparison
            const lastCardAssignments = new Map(state.cachedCardAssignments)
            // Re-use the existing Map to preserve identity
            const cardAssignments = state.cachedCardAssignments
            cardAssignments.clear()
            // Gather the cards that were visible at the last timestep.
            // We'll work out which of these are no longer visible, and animate them away.
            const outgoingCards = new Set<RuleCard>()
            lastCardAssignments.forEach((column, card) => {
                if (column.layout.isRuleColumn) outgoingCards.add(card)
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
                    type: "Start card animation",
                    target: null,
                })
            }, 0)

            // Assign the rule (and its whole component, if exists) to the given column
            function assignComponentToColumn(component: Component, column: Column): void {
                if (!column.items.has(component)) {
                    column.items.add(component)
                    for (const relation of component.relations) {
                        for (const rule of relation.rules) {
                            const ruleCard = state.ruleGraph.rules.get(rule) as RuleCard
                            cardAssignments.set(ruleCard, column)
                            if (lastCardAssignments.has(ruleCard)) {
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
                const selectedComponentColumn: Column = observable({layout: state.columnLayouts.center, items: new Set()})
                if (state.centeredItem !== null && isComponent(state.centeredItem)) {
                    const selectedComponent = state.centeredItem
                    assignComponentToColumn(selectedComponent, selectedComponentColumn)
                    // Put dependencies and dependent components into adjacent columns
                    const dependenciesColumn: Column = observable({layout: state.columnLayouts.dependencies, items: new Set()})
                    const dependentsColumn: Column = observable({layout: state.columnLayouts.dependents, items: new Set()})
                    selectedComponent.dependents.forEach(dependent => {
                        assignComponentToColumn(dependent, dependentsColumn)
                    })
                    selectedComponent.dependencies.forEach(dependency => {
                        assignComponentToColumn(dependency, dependenciesColumn)
                    })
                }
                else { // an INCOMPLETE rule is centered, so it will be the only thing in the column
                    const ruleCard = state.centeredItem
                    selectedComponentColumn.items.add(ruleCard)
                    cardAssignments.set(ruleCard, selectedComponentColumn)
                    if (lastCardAssignments.has(ruleCard)) {
                        outgoingCards.delete(ruleCard)
                    }
                    else {
                        ruleCard.newlyDisplayed = true
                        incomingCards.add(ruleCard)
                    }
                }
            }
            return {card: cardAssignments, relation: new Map()}
        },
        columnYPositions: state => {
            
            // We compute this separately to columnAssignments so that the assignments
            // aren't recomputed from scratch whenever a rule card is edited.
            return {card: new Map(), relation: new Map()}
        },
    })
}
/* eslint-enable @typescript-eslint/no-use-before-define */

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
console.log("App state:", state)

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

function getSetForRule<T>(card: RuleCard, sets: Map<Rule, Set<T>>): Set<T> {
    if (card.lastParsed !== null) {
        const refs = sets.get(card.lastParsed.rule)
        if (refs === undefined) {
            return new Set()
        }
        else {
            return refs
        }
    }
    else return new Set()
}

function getInternalReferences(card: RuleCard): Set<number> {
    return getSetForRule(card, state.ruleGraph.internalReferences)
}

function getIncorrectArities(card: RuleCard): Set<number> {
    return getSetForRule(card, state.ruleGraph.incorrectArities)
}

function getInternalNegations(card: RuleCard): Set<number> {
    return getSetForRule(card, state.ruleGraph.internalNegations)
}

function getDerivations(card: RuleCard): Set<TupleWithDerivations> {
    if (card.lastParsed !== null) {
        return state.derivations.perRule.get(card.lastParsed.rule) as Set<TupleWithDerivations>
    }
    else return new Set()
}

function getDerivationCount(relation: Relation): number {
    const refs = state.derivations.perRelation.get(relation) as TupleLookup
    let count = 0
    refs.forEach((tuple, id) => {
        count += tuple.derivations.length
    })
    return count
}

function getUnfoundedDerivationCount(relation: Relation): number {
    const refs = state.derivations.perRelation.get(relation) as TupleLookup
    let count = 0
    refs.forEach((tuple, id) => {
        count += tuple.unfoundedDerivations.length
    })
    return count
}

function hasError(card: RuleCard): boolean {
    return (card.parseErrorText !== null
        || getUnboundVariables(card).size > 0
        || getIncorrectArities(card).size > 0
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
        const incorrectArities = getIncorrectArities(card)
        const internalNegations = getInternalNegations(card)
        if (unboundVariables.size > 0) {
            let errorVars = ""
            for (const v of unboundVariables) {
                errorVars += `${v}, `
            }
            errorText += `Unbound variables: ${errorVars.slice(0, -2)}.`
            if (internalNegations.size > 0) errorText += "\n"
        }
        if (incorrectArities.size > 0) {
            let errorLines = ""
            for (const index of incorrectArities) {
                errorLines += `${index+1}, `
            }
            errorText += `Incorrect arity on line ${errorLines.slice(0, -2)}.`
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

function tuckBarText(card: RuleCard): string {
    if (card.lastParsed === null) {
        return "not executed"
    }
    else {
        const tuples = state.derivations.perRule.get(card.lastParsed.rule) as Set<TupleWithDerivations>
        if (tuples.size === 1) {
            return "1 tuple"
        }
        else return `${tuples.size} tuples`
    }
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
            (el as any)["data-1"].cardHeight = el.offsetHeight
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
            type: "Apply new card height",
            target: null,
        })
    }
})
observer.observe(document, { childList: true, subtree: true })

app ("app", state,
    div ({class: "view"}, [
        div ({class: "row"}, [
            div ({class: "col"}, [
                h1 ("Design directions"),
                list ({class: "ideaList"}, {class: "listItem"}, [
                    h3 ("Keep interactions tablet-friendly (material design, drag to resize...). Working on a program can be a kinesthetic experience."),
                    h3 ("Information design: show the data, and show comparisons."),
                    h3 ("The neighbourhood of an element should always be visible, so that the effects of incremental changes are obvious (Lean on video games e.g. Factorio: inherently local cause-and-effect)."),
                    h3 ("Andy Matuschak (his notes): we learn SKILLS and UNDERSTANDING through doing, and observing/mimicking the tacit knowledge of \"experts\" (craftsmen, Twitch streamers, lecturers explaining)."),
                    h3 ("But how do we develop NEW APPROACHES to (as opposed to understanding of) a problem/task? First, gain a MASTERFUL UNDERSTANDING of the existing problem & approaches, and then develop approaches from there (e.g. reasoning by first principles)."),
                    h3 ("As I keep re-discovering, graphs are crap, and there is no \"magic\" visualisation waiting to be invented. What core visual primitives can communicate data and their relationships? Relative positioning, shape and colour matching... Review literature."),
                    h3 ("Let the person who defines a relation label its meaning, and show it in tooltips: http://worrydream.com/#!/LearnableProgramming"),
                ]),
                br(),
                h1 ("Implementation approach"),
                list ({class: "ideaList"}, {class: "listItem"}, [
                    h3 ("By default, when I ask \"how do I implement this feature?\", start by looking at Soufflé, which is the only modern, scalable, \"production-ready\" Datalog system."),
                    h3 ("Only worry about finding efficient EVALUATION SCHEMES for generic Datalog programs. All other computations (e.g. statics, debug info) can be encoded as Datalog programs."),
                    h3 ("Principle: debugging is \"always on\", even for end-users. At minimum this means recording event history, but if exploring a single moment in time, it means storing all tuples."),
                    h3 ("Top-down execution is not parallelizable, since it requires coordination on caches to prevent work duplication (and it relies on a sequential call stack). Top-down ≡ lazy bottom-up. Ideal world: parallel array iteration & message passing, not sequential recursion & synchronization (\"DFS is hard to parallelize\")."),
                ]),
                br(),
            ]),
            div ({class: "ruleOverview"}, [
                button ("Add rule", {
                    class: "addRuleButton",
                    onclick: newRule,
                }),
                div ({class: "componentList"}, [
                    $for (() => state.ruleCards.filter(c => c.lastParsed === null), card => [
                        div ({
                            class: "component",
                            onclick: () => state.centeredItem = card,
                            left: () => state.centeredItem === card ? px(-12) : px(8),
                        }, [
                            p (() => overviewTextForIncompleteCard(card), {class: "relation incompleteCardSummaryText"}),
                        ]),
                    ]),
                    // Iterate over the UNIQUE components stored in the component Map
                    $for (() => new Set(state.ruleGraph.components.values()).values(), component => [
                        div ({
                            class: "component",
                            onclick: () => state.centeredItem = component,
                            left: () => state.centeredItem === component ? px(-12) : px(8),
                        }, [
                            $for (() => component.relations.values(), relation => [
                                p ("(3) " + relation.name, {class: "relation"}),
                            ]),
                        ]),
                    ]),
                ]),
            ]),
        ]),
        div ({class: "ruleGraphView"}, [
            $set (() => state.ruleGraph.relations, relationName => [
                div ({
                    class: "relationBanner",
                    // left: () => computeRelationLeft(relationName),
                    // top: () => computeRelationTop(relationName),
                    // width: () => computeRelationWidth(relationName),
                    // height: () => computeRelationHeight(relationName),
                }, [
                    //p (relationName, {class: "relation"}),
                ]),
            ]),
            $set (() => state.columnAssignments.card, ruleCard => [
                // div ({
                //     class: "ruleCardShadow",
                //     "z-index": () => computeZIndex(ruleCard) - 1, // render behind cards
                //     left: () => computeLeftPosition(ruleCard),
                //     top: () => computeTopPosition(ruleCard),
                //     width: () => computeWidth(ruleCard),
                //     height: () => `${ruleCard.cardHeight}px`,
                // }),
                div ({
                    class: () => `ruleCard ${
                        hasError(ruleCard)
                        ? "ruleCardError"
                        : ""
                    }`,
                    right: () => state.columnAssignments.card.get(ruleCard)?.layout.right as string,
                    top: () => px(0),
                    width: () => state.columnLayouts.ruleCardWidth,
                    height: () => `${ruleCard.cardHeight}px`,
                }, [
                    div ({class: "ruleCardBody"}, [
                        // Computed conclusions
                        // div ({
                        //     class: "ruleDataSide",
                        //     width: () => ruleCard.isCentered ? px(dataShownWidth) : px(dataHiddenWidth),
                        // }, [
                        //     div ({class: "dataSearchBar"}, [
                        //         img ("./glass-short.svg", {
                        //             class: "dataSearchIcon",
                        //         }),
                        //         input ({class: "dataSearchBox"}),
                        //     ]),
                        //     div ({
                        //         class: "dataScrollPane",
                        //     }, [
                        //         $for (() => getDerivations(ruleCard).values(), tuple => [
                        //             div ({
                        //                 class: "data",
                        //                 color: () => ruleCard.isCentered ? "black" : "transparent",
                        //             }, [
                        //                 p (tupleToString(tuple.tuple)),
                        //             ]),
                        //         ]),
                        //     ]),
                        // ]),
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
                                        parseRuleCardFromText(ruleCard, ruleCard.rawText)
                                        if (ruleCard.lastParsed !== null) {
                                            // Center the component of the newly parsed rule
                                            state.centeredItem = componentOf(ruleCard.lastParsed?.rule as Rule, state.ruleGraph)
                                        }
                                        else {
                                            // Center just this rule card as a component
                                            state.centeredItem = ruleCard
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
                                                ruleCard.cardHeight = codeDiv.offsetHeight
                                            })({
                                                type: "Measure card height",
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
                        p (() => tuckBarText(ruleCard), {class: "factCount"}),
                        div ({class: "grow"}),
                        button ("✖", {
                            class: "deleteCardButton",
                            visibility: () => state.editingRule === ruleCard ? "visible" : "hidden",
                            onclick: () => {
                                state.cachedCardAssignments.delete(ruleCard) // don't animate deletion
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
                                        if (myRelation.rules.size > 0) {
                                            // Select another rule in the relation
                                            for (const rule of myRelation.rules) {
                                                if (rule !== myRule) {
                                                    candidateRuleCard = state.ruleGraph.rules.get(rule) as RuleCard
                                                    break
                                                }
                                            }
                                        }
                                        else {
                                            // Select the first rule from another relation in the component
                                            for (const relation of myComponent.relations) {
                                                if (relation !== myRelation && relation.rules.size > 0) {
                                                    const rule = relation.rules.values().next().value
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
        div ({class: "viewBottomPadding"}),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

//#endregion
import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs, reactive as observable, computed as derivedMalloc, ComputedRef } from "@vue/reactivity"
import { $derived, $if, $for, app, div, p, br, button, input } from "./lib-view"
import "./lib-derived-state"
import Cycle from "json-cycle"
import { mergeWith } from "lodash"

import * as IDRegistry from "./id-registry"

//#region  --- Essential & derived state ---

// Concepts referenced within rules may be constants (from the
// global registry) or variables (from the rule's own registry).
interface Concept {
    id: IDRegistry.ID
    registry: IDRegistry.T // the registry to which the concept is registered
}

// State of a concept search (for constants or variables)
interface Search {
    active: boolean
    text: ""
    registries: IDRegistry.T[]
    selection: number
}

// Empty search state
function search(registries: IDRegistry.T[]): Search {
    return {
        active: false,
        text: "",
        registries: registries,
        selection: 0,
    }
}

interface Link {
    subject: { concept: Concept, search: Search }
    relation: { concept: Concept, search: Search }
    object: { concept: Concept, search: Search }
}

function link(varRegistry: IDRegistry.T, subject: Concept, relation: Concept, object: Concept): Link {
    return { // ESLint complains about use of "state" before initialization
        subject: { concept: subject, search: search([state.conceptRegistry, varRegistry]) }, // eslint-disable-line
        relation: { concept: relation, search: search([state.conceptRegistry, varRegistry]) }, // eslint-disable-line
        object: { concept: object, search: search([state.conceptRegistry, varRegistry]) }, // eslint-disable-line
    }
}

interface Rule {
    id: number
    varRegistry: IDRegistry.T // for local variables
    head?: Link
    body: Link[]
}

interface $Rule extends Rule { // with derived state
    magic: number
    doubleMagic: number
}

const $Rule = (rule: Rule): $Rule => rule as $Rule

interface RuleView {
    rules: $Rule[]
}

interface State {
    conceptRegistry: IDRegistry.T
    conceptCreatorSearch: Search
    ruleRegistry: IDRegistry.T // for naming and searching for specific rules
    rules: $Rule[]
    currentView: RuleView
    currentSearch: undefined | Search
}

function createState(existingState?: State): State {
    const conceptRegistry = IDRegistry.empty()
    const initialState: State = observable({
        conceptRegistry,
        conceptCreatorSearch: search([conceptRegistry]),
        ruleRegistry: IDRegistry.empty(),
        rules: Array.withDerivedProps({
            magic: rule => rule.doubleMagic * 10,
            doubleMagic: rule => rule.id * 100,
        }),
        currentView: {rules: []},
        currentSearch: undefined,
    })

    if (existingState !== undefined) {
        // Deeply replace each property of the state with that of the existing state.
        // This ensures that important structure (e.g. Proxies) are kept intact.
        mergeWith(initialState, existingState, (existingValue, assignedValue) =>
            // Returning undefined means "merge recursively as normal"
            typeof existingValue === typeof assignedValue ? undefined : existingValue
        )
    }
    return observable(initialState)
}

const currentSearchMatches: ComputedRef<IDRegistry.SearchResult[]> =
    derivedMalloc(() => {
        if (state.currentSearch === undefined) {
            return []
        }
        else {
            const text = state.currentSearch.text
            const errorTolerance = (text.length <= 1) ? 0 : 1
            // Search all given registries
            const searchResults: IDRegistry.SearchResult[] = []
            state.currentSearch.registries.forEach(
                r => searchResults.push(...IDRegistry.getMatchesForPrefix(r, text, errorTolerance))
            )
            // Sort the results by closeness
            searchResults.sort((a, b) => a.distance - b.distance)
            return searchResults
        }
    })

//#endregion
//#region  --- State initialization, saving and loading ---

const state: State =
    // Load previous state, if applicable
    (   localStorage.loadLastState === "true"
     && localStorage.state !== undefined
     && localStorage.state !== "undefined"
    )
    ? createState(Cycle.retrocycle(JSON.parse(localStorage.state)))
    : createState()

console.log("App state: ", state) // for debugging

function saveState(): void {
    // TODO: Have data auto-save periodically (every 10 sec?)
    localStorage.state = JSON.stringify(Cycle.decycle(state))
}

// Save on quit, and load on start
window.addEventListener("beforeunload", saveState)
localStorage.loadLastState = true

function loadLastSave(): void {
    window.removeEventListener("beforeunload", saveState)
    location.reload()
}

function resetState(): void {
    localStorage.loadLastState = false
    location.reload()
}

//#endregion
//#region  --- The view & transition logic ----

function newRule(i: number): void {
    const id = IDRegistry.newID(state.ruleRegistry, "Unnamed rule")
    const varRegistry = IDRegistry.empty()
    const c: Concept = {id: 0, registry: state.conceptRegistry} // placeholder concept

    state.rules.insert(i, $Rule({
        id: id,
        varRegistry,
        head: link(varRegistry, c, c, c),
        body: [link(varRegistry, c, c, c)],
    }))
}

function selectPrevious(): void {
    if (state.currentSearch !== undefined && state.currentSearch.selection > 0) {
        --state.currentSearch.selection
    }
}

function selectNext(): void {
    if (state.currentSearch !== undefined && state.currentSearch.selection < currentSearchMatches.value.length - 1) {
        ++state.currentSearch.selection
    }
}

function createConcept(label: string): void {
    if (label.length > 0) {
        IDRegistry.newID(state.conceptRegistry, label)
    }
}

const linkEl = (link: Link): HTMLElement =>
    div ({
        className: "row",
    },[
        p("LINK"),
    ])

app("app",
    div ({className: "matchParentSize col"}, [
        div ({className: "toolbar"}, [
            button ("Reset state", {
                onclick: resetState,
            }),
        ]),
        div ({className: "database"}, [
            div ({className: "ruleView"}, [
                div ({
                    className: "insertHere",
                    onclick: () => newRule(0),
                }),
                $for (state.rules, rule => [
                    div ({className: "rule"}, [
                        p ($derived(() => rule.magic.toString() + " " + rule.doubleMagic.toString()), {
                            className: "noSelect",
                            onclick: () => rule.id += 1,
                        }),
                        $if (() => rule.head === undefined, {
                            _then: () => [],
                            _else: () => [linkEl (rule.head!)],
                        }),
                        $for (rule.body, link => [p (" -- "), linkEl (link)]),
                    ]),
                    div ({
                        className: "insertHere",
                        onclick: () => newRule(rule.$index+1),
                    }),
                ]),
            ]),
            br (),
            br (),
            p ("Create a new concept:"),
            input ({
                autocomplete: "nope",
                value: toRefs(state.conceptCreatorSearch).text,
                onkeydown: (e: KeyboardEvent) => {
                    if (e.key === "ArrowDown") selectNext()
                    else if (e.key === "ArrowUp") selectPrevious()
                    else if (e.key === "Enter") createConcept(state.conceptCreatorSearch.text)
                },
                onfocus: () => {
                    state.currentSearch = state.conceptCreatorSearch
                    state.conceptCreatorSearch.active = true
                },
                onblur: () => {
                    state.currentSearch = undefined
                    state.conceptCreatorSearch.active = false
                },
            }),
            $for (currentSearchMatches, match => [
                p ($derived(() => `${match.key} [${match.value}]`), {
                    className:
                        $if (() => match.$index === state.conceptCreatorSearch.selection, {
                            _then: () => "suggestionBox highlighted",
                            _else: () => "suggestionBox",
                        }),
                }),
            ]),
        ]),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

//#endregion
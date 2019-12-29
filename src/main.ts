import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs, reactive as observable, computed as derivedMalloc, ComputedRef } from "@vue/reactivity"
import { $derived, $if, $for, app, div, p, br, button, input } from "./view-library"
import Cycle from "json-cycle"
import { mergeWith } from "lodash"

import * as IDRegistry from "./id-registry"

//#region  --- Essential state ---

// A concept points to the registry that it belongs to. Concepts
// referenced within rules may be constants (from the global registry)
// or variables (from the rule's own registry).
type Concept = {id: IDRegistry.ID, registry: IDRegistry.T}

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

// TWO WAYS TO INTERPRET "TAGS" (THE PAIRING OF TWO VALUES):
// Related to some topic:    tag / label / class / category
// Part of some collection:  group / collection / set
// Can't this binary relation just be implemented by an EAV with A = "is"?
// Just make sure we have a really concise shorthand for this.

// relation (instance, not class) / connection / edge / link / coupling / pairing / bond
interface Link {
    subject: { concept: Concept, search: Search }
    relation: { concept: Concept, search: Search }
    object: { concept: Concept, search: Search }
}
// out-links, in-links

function link(varRegistry: IDRegistry.T, subject: Concept, relation: Concept, object: Concept): Link {
    /* eslint-disable */// Complains about use of "state" before initialization
    return {
        subject: { concept: subject, search: search([state.conceptRegistry, varRegistry]) },
        relation: { concept: relation, search: search([state.conceptRegistry, varRegistry]) },
        object: { concept: object, search: search([state.conceptRegistry, varRegistry]) },
    }
}

interface Rule {
    id: number
    varRegistry: IDRegistry.T // for local variables
    head?: Link
    body: Link[]
}

interface RuleView {
    rules: Rule[]
}

// N.B. The State should be pure data. To ensure serializability
// & deserializability, there should be no functions or methods
// anywhere in the state.
type State = {
    conceptRegistry: IDRegistry.T
    conceptCreatorSearch: Search
    ruleRegistry: IDRegistry.T // for naming and searching for specific rules
    rules: Rule[]
    currentView: RuleView
    currentSearch: undefined | Search
}

function initialState(): State {
    const conceptRegistry = IDRegistry.empty()
    return {
        conceptRegistry,
        conceptCreatorSearch: search([conceptRegistry]),
        ruleRegistry: IDRegistry.empty(),
        rules: [],
        currentView: {rules: []},
        currentSearch: undefined,
    }
}

// Set up fresh state
const state: State = observable(initialState())
console.log("App state: ", state) // for debugging

//#endregion
//#region  --- Derived state ---

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
//#region  --- Save and load ---

function saveState(): void {
    // TODO: Have data auto-save periodically (every 10 sec?)
    localStorage.state = JSON.stringify(Cycle.decycle(state))
    localStorage.loadLastState = true
}

// Save on quit, and load on start
window.addEventListener("beforeunload", saveState)

// Load previous state, if applicable
if (   localStorage.loadLastState === "true"
&& localStorage.state !== undefined
&& localStorage.state !== "undefined"
) {
    // Deeply replace each property of the state with those loaded from storage.
    // Note: if we need to customize the merging behaviour then Lodash also has a "mergeWith" fn.
    mergeWith(
        state,
        Cycle.retrocycle(JSON.parse(localStorage.state)),
        (existingValue, assignedValue) =>
            typeof existingValue === typeof assignedValue ? assignedValue : existingValue,
    )
}

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

    state.rules.insert(i, {
        id: id,
        varRegistry,
        head: link(varRegistry, c, c, c),
        body: [link(varRegistry, c, c, c)],
    })
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
        p("LINK")
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
                        $if (() => rule.head !== undefined, {
                            _then: () => [linkEl (rule.head!)],
                            _else: () => [],
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
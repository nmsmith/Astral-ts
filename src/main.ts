import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs } from "@vue/reactivity"
import { $if, $for, app, div, p, br, button, input } from "./lib-view"
import "./lib-derived-state"
import Cycle from "json-cycle"
import { mergeWith } from "lodash"

import * as IDRegistry from "./id-registry"
import { WithDerivedProps, DerivedProps, withDerivedProps } from "./lib-derived-state"

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

interface $Search extends Search {
    results: IDRegistry.SearchResult[]
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

interface $Link {
    subject: { concept: Concept, search: $Search }
    relation: { concept: Concept, search: $Search }
    object: { concept: Concept, search: $Search }
}

function link(conceptRegistry: IDRegistry.T, varRegistry: IDRegistry.T, subject: Concept, relation: Concept, object: Concept): Link {
    return {
        subject: { concept: subject, search: search([conceptRegistry, varRegistry]) },
        relation: { concept: relation, search: search([conceptRegistry, varRegistry]) },
        object: { concept: object, search: search([conceptRegistry, varRegistry]) },
    }
}

interface Rule {
    id: number
    varRegistry: IDRegistry.T // for local variables
    head: Link
    body: Link[]
}

interface $Rule extends Rule { // with derived state
    readonly magic: number
    readonly doubleMagic: number
    head: $Link
    body: $Link[]
}

const $Rule = (rule: Rule): $Rule => rule as $Rule

interface RuleView {
    rules: $Rule[]
}

interface State {
    conceptRegistry: IDRegistry.T // the database Domain
    conceptCreatorSearch: $Search
    ruleRegistry: IDRegistry.T // for naming and searching for specific rules
    readonly rules: $Rule[]
    currentView: RuleView
}

function searchResults(search: Search): IDRegistry.SearchResult[] {
    const errorTolerance = (search.text.length <= 1) ? 0 : 1
    // Search all given registries
    const searchResults: IDRegistry.SearchResult[] = []
    search.registries.forEach(r =>
        searchResults.push(
            ...IDRegistry.getMatchesForPrefix(r, search.text, errorTolerance)
        )
    )
    // Sort the results by closeness
    searchResults.sort((a, b) => a.distance - b.distance)
    return searchResults
}

function createState(existingState?: State): WithDerivedProps<State> {
    /* eslint-disable @typescript-eslint/explicit-function-return-type */
    const linkDerivedProps: DerivedProps<$Link> = {
        subject: {
            search: {
                results: searchResults,
            },
        },
        relation: {
            search: {
                results: searchResults,
            },
        },
        object: {
            search: {
                results: searchResults,
            },
        },
    }
    const conceptRegistry = IDRegistry.empty()
    const initialState: WithDerivedProps<State> = withDerivedProps({
        conceptRegistry,
        conceptCreatorSearch:
            search([conceptRegistry]) as $Search,
        ruleRegistry:
            IDRegistry.empty(),
        rules:
            [] as $Rule[],
        currentView:
            {rules: []},
    }, {
        conceptCreatorSearch: {
            results: searchResults,
        },
        rules: {
            magic: rule => rule.doubleMagic * 10,
            doubleMagic: rule => rule.id * 100,
            head: linkDerivedProps,
            body: linkDerivedProps,
        },
    })

    if (existingState !== undefined) {
        // Deeply replace each property of the state with that of the existing state.
        // This ensures that important structure (e.g. Proxies) are kept intact.
        mergeWith(initialState, existingState, (existingValue, assignedValue) =>
            // Returning undefined means "merge recursively as normal"
            typeof existingValue === typeof assignedValue ? undefined : existingValue
        )
    }
    return initialState
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

console.log("App state: ", state) // for debugging

function destroyPropsAndSaveState(): void {
    // TODO: Figure out how to save essential state in a way that doesn't destroy
    // the derived state! I think this would be possible by switching the props
    // from "real" props to getters, so that the serializer ignores them.
    // If we can do this, then we can get rid of the destroyDerivedProps() methos
    // and the WithDerivedProps<> type.
    state.destroyDerivedProps()
    localStorage.state = JSON.stringify(Cycle.decycle(state))
}

// Save on quit, and load on start
window.addEventListener("beforeunload", destroyPropsAndSaveState)
localStorage.loadLastState = true

function loadLastSave(): void {
    window.removeEventListener("beforeunload", destroyPropsAndSaveState)
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
        head: link(state.conceptRegistry, varRegistry, c, c, c),
        body: [link(state.conceptRegistry, varRegistry, c, c, c)],
    }))
}

function selectPrevious(search: $Search): void {
    if (search.selection > 0) {
        --search.selection
    }
}

function selectNext(search: $Search): void {
    if (search.selection < search.results.length - 1) {
        ++search.selection
    }
}

function createConcept(): void {
    const label = state.conceptCreatorSearch.text
    if (label.length > 0) {
        IDRegistry.newID(state.conceptRegistry, label)
        state.conceptCreatorSearch.text = ""
    }
}

const linkEl = (link: Link): HTMLElement =>
    div ({
        class: "row",
    },[
        p("("),
        p(link.subject.concept.toString()),
    ])

app("app",
    div ({class: "matchParentSize col"}, [
        div ({class: "toolbar"}, [
            button ("Reset state", {
                onclick: resetState,
            }),
        ]),
        div ({class: "database"}, [
            div ({class: "ruleView"}, [
                div ({
                    class: "insertHere",
                    onclick: () => newRule(0),
                }),
                $for (() => state.rules, rule => [
                    div ({class: "rule"}, [
                        p (() => rule.magic.toString() + " " + rule.doubleMagic.toString(), {
                            class: "noSelect",
                            onclick: () => rule.id += 1,
                        }),
                        linkEl (rule.head),
                        $for (() => rule.body, link => [p (" -- "), linkEl (link)]), 
                    ]),
                    div ({
                        class: "insertHere",
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
                    if (e.key === "ArrowDown") selectNext(state.conceptCreatorSearch)
                    else if (e.key === "ArrowUp") selectPrevious(state.conceptCreatorSearch)
                    else if (e.key === "Enter") createConcept()
                },
                onfocus: () => {
                    state.conceptCreatorSearch.active = true
                },
                onblur: () => {
                    state.conceptCreatorSearch.active = false
                },
            }),
            $for (() => state.conceptCreatorSearch.results, match => [
                p (() => `${match.key} [${match.value}]`, {
                    class:
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
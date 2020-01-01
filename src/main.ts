import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs } from "@vue/reactivity"
import { $if, $for, app, div, p, br, button, input } from "./lib-view"
import "./lib-derived-state"
import Cycle from "json-cycle"
import { mergeWith } from "lodash"

import * as Registry from "./concept-registry"
type Concept = Registry.Concept
import { WithDerivedProps, DerivedProps, withDerivedProps } from "./lib-derived-state"

//#region  --- Essential & derived state ---

// State of a concept search (for constants or variables)
interface Search {
//essential
    active: boolean
    text: ""
    readonly registries: Registry.T[]
    selection: number
//derived
    readonly results: Registry.SearchResult[]
}

function Search(registries: Registry.T[]): Search {
    return {
        active: false,
        text: "",
        registries: registries,
        selection: 0,
    } as Search
}

function searchResults(search: Search): Registry.SearchResult[] {
    const errorTolerance = (search.text.length <= 1) ? 0 : 1
    // Search all given registries
    const searchResults: Registry.SearchResult[] = []
    search.registries.forEach(r =>
        searchResults.push(
            ...Registry.findConceptsWithLabelPrefix(r, search.text, errorTolerance)
        )
    )
    // Sort the results by closeness
    searchResults.sort((a, b) => a.distance - b.distance)
    return searchResults
}

interface Link {
    readonly subject: { concept: Concept, search: Search }
    readonly relation: { concept: Concept, search: Search }
    readonly object: { concept: Concept, search: Search }
}

function Link(conceptRegistry: Registry.T, varRegistry: Registry.T, subject: Concept, relation: Concept, object: Concept): Link {
    return {
        subject: { concept: subject, search: Search([conceptRegistry, varRegistry]) },
        relation: { concept: relation, search: Search([conceptRegistry, varRegistry]) },
        object: { concept: object, search: Search([conceptRegistry, varRegistry]) },
    }
}

const linkDerivedProps: DerivedProps<Link> = {
    subject: { search: { results: searchResults } },
    relation: { search: { results: searchResults } },
    object: { search: { results: searchResults } },
}

interface Rule {
    readonly ruleConcept: Concept // rules are themselves concepts to make them searchable
    readonly varRegistry: Registry.T // for local variables
    readonly head: Link
    readonly body: Link[]
}

interface RuleView {
    readonly rules: Rule[]
}

interface State {
    readonly conceptRegistry: Registry.T // the database Domain
    readonly conceptCreatorSearch: Search
    readonly ruleRegistry: Registry.T // for naming and searching for specific rules
    readonly rules: Rule[]
    currentView: RuleView
}

function createState(existingState?: State): WithDerivedProps<State> {
    const conceptRegistry = Registry.empty("concept")
    const initialState: WithDerivedProps<State> = withDerivedProps({
        conceptRegistry,
        conceptCreatorSearch:
            Search([conceptRegistry]),
        ruleRegistry:
            Registry.empty("rule"),
        rules:
            [] as Rule[],
        currentView:
            {rules: []},
    }, {
        conceptCreatorSearch: {
            results: searchResults,
        },
        rules: {
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

function saveState(): void {
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
    const ruleConcept = Registry.newConcept(state.ruleRegistry)
    const varRegistry = Registry.empty("var")
    const c: Concept = Registry.newConcept(state.conceptRegistry) // placeholder concept

    state.rules.insert(i, {
        ruleConcept,
        varRegistry,
        head: Link(state.conceptRegistry, varRegistry, c, c, c),
        body: [Link(state.conceptRegistry, varRegistry, c, c, c)],
    })
}

function selectPrevious(search: Search): void {
    if (search.selection > 0) {
        --search.selection
    }
}

function selectNext(search: Search): void {
    if (search.selection < search.results.length - 1) {
        ++search.selection
    }
}

function createConcept(): void {
    const label = state.conceptCreatorSearch.text
    if (label.length > 0) {
        const outcome = Registry.newConcept(state.conceptRegistry, label)
        if (outcome !== "invalidLabel" && outcome !== "labelInUse") {
            state.conceptCreatorSearch.text = ""
        }
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
                    p (rule.ruleConcept.label),
                    div ({class: "rule"}, [
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
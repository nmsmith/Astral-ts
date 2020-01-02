import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs } from "@vue/reactivity"
import { $if, $for, app, div, p, br, button, input } from "./lib-view"
import "./lib-derived-state"
import Cycle from "json-cycle"

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
    readonly subject: { concept: Concept | undefined, search: Search }
    readonly relation: { concept: Concept | undefined, search: Search }
    readonly object: { concept: Concept | undefined, search: Search }
}

function Link(conceptRegistry: Registry.T, varRegistry: Registry.T, subject?: Concept, relation?: Concept, object?: Concept): Link {
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
    const essentialState = existingState !== undefined ? existingState : {
        conceptRegistry,
        conceptCreatorSearch:
            Search([conceptRegistry]),
        ruleRegistry:
            Registry.empty("rule"),
        rules:
            [] as Rule[],
        currentView:
            {rules: []},
    }
    return withDerivedProps(essentialState, {
        conceptCreatorSearch: {
            results: searchResults,
        },
        rules: {
            head: linkDerivedProps,
            body: linkDerivedProps,
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

console.log("App state: ", state) // for debugging

function saveState(): void {
    // If an input element is focused, trigger its blur event
    if (document.activeElement !== null && document.activeElement.tagName === "INPUT") {
        (document.activeElement as HTMLInputElement).blur()
    }
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
        body: [
            Link(state.conceptRegistry, varRegistry, c, c, c),
            Link(state.conceptRegistry, varRegistry, c, c, c),
        ],
    })
}

function newPremise(rule: Rule): void {
    rule.body.push(Link(state.conceptRegistry, rule.varRegistry))
}

const searchBox = (search: Search, onSelect: () => void): HTMLElement =>
    div({class: "searchBox"}, [
        input ({
            autocomplete: "nope",
            value: toRefs(search).text,
            onkeydown: (e: KeyboardEvent) => {
                if (e.key === "ArrowDown" && search.selection < search.results.length - 1) {
                    ++search.selection
                }
                else if (e.key === "ArrowUp" && search.selection > 0) {
                    --search.selection
                }
                else if (e.key === "Enter") onSelect()
            },
            onfocus: () => search.active = true,
            onblur: () => search.active = false,
        }),
        div({class: "searchResultsLocation"}, [ // searchResults div is positioned relative to here
            $if (() => search.active, {
                $then: () => [
                    div({
                        class: "searchResults",
                        // Prevent the "blur" event from occurring when the dropdown is clicked
                        onmousedown: event => event.preventDefault(),
                    }, [
                        $for (() => search.results, result => [
                            div ({
                                class:
                                    $if (() => result.$index === search.selection, {
                                        $then: () => "searchResult highlighted",
                                        $else: () => "searchResult",
                                    }),
                            }, [
                                p (() => result.key),
                                div ({class: "smallXSpacer grow"}),
                                p ("X", {
                                    class: "deleteButton",
                                    onclick: () => Registry.deleteConcept(result.value),
                                }),
                            ]),
                        ]),
                    ]),
                ],
                $else: () => [],
            }),

        ]),
    ])

const linkEl = (link: Link): HTMLElement =>
    div ({class: "link"}, [
        div({class: "row"}, [
            $if (() => link.subject.concept === undefined, {
                $then: () => [searchBox(link.subject.search, () => {
                    // do nothing
                })],
                $else: () => [p(() => (link.subject.concept as Concept).label, {class: "subject"})],
            }),
            p(":"),
        ]),
        
        div({class: "linkSpacer"}),
        //p(() => link.relation.concept.label, {class: "relation"}),
        div({class: "linkSpacer"}),
        //p(() => link.object.concept.label, {class: "object"}),
    ])

app("app",
    div ({class: "database"}, [
        div ({class: "toolbar"}, [
            button ("Reset state", {
                onclick: resetState,
            }),
        ]),
        div ({class: "separator"}),
        div ({class: "ruleView"}, [
            div ({
                class: "ruleInsertionPoint",
                onclick: () => newRule(0),
            }),
            $for (() => state.rules, rule => [
                div({class: "rule"}, [
                    div ({class: "ruleLabel"}, [
                        p (() => rule.ruleConcept.label),
                    ]),
                    div ({class: "ruleContent"}, [
                        linkEl (rule.head),
                        div ({class: "ruleBody"}, [
                            $for (() => rule.body, link => [
                                div({class: "smallYSpacer"}),
                                linkEl (link),
                            ]),
                            div({
                                class: "linkInsertionPoint",
                                onclick: () => newPremise(rule),
                            }),
                        ]),
                    ]),
                ]),
                div ({
                    class: "ruleInsertionPoint",
                    onclick: () => newRule(rule.$index+1),
                }),
            ]),
        ]),
        div ({class: "separator"}),
        br (),
        p ("Create a new concept:"),
        searchBox(state.conceptCreatorSearch, () => {
            const label = state.conceptCreatorSearch.text
            if (label.length > 0) {
                const outcome = Registry.newConcept(state.conceptRegistry, label)
                if (typeof outcome === "object") {
                    state.conceptCreatorSearch.text = ""
                }
            }
        }),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

//#endregion
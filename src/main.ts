import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs } from "@vue/reactivity"
import { DerivedDocFragment, $if, $for, app, div, p, br, button, input, span } from "./lib-view"
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
    text: string
    textOnBlur: string // the text that the search box should be set to on blur
    readonly registries: Registry.T[]
    selection: number | undefined
//derived
    readonly results: Registry.SearchResult[]
}

function Search(registries: Registry.T[]): Search {
    return {
        active: false,
        text: "",
        textOnBlur: "",
        registries: registries,
        selection: undefined,
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
    // Reset the selected result
    search.selection = (searchResults.length > 0) ? 0 : undefined
    return searchResults
}

interface LinkItem {
    concept: Concept | undefined
    readonly search: Search
}

interface Link {
    readonly subject: LinkItem
    readonly relation: LinkItem
    readonly object: LinkItem
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

    state.rules.insert(i, {
        ruleConcept,
        varRegistry,
        head: Link(state.conceptRegistry, varRegistry),
        body: [],
    })
}

function newPremise(rule: Rule): void {
    rule.body.push(Link(state.conceptRegistry, rule.varRegistry))
}

const searchBox = (
    search: Search,
    options: {
        borderAlwaysVisible?: boolean // default: true
        searchTextClass?: string
        onActive?: () => void
        onSelect?: () => void
    }
): HTMLElement =>
    div ({class: "searchBox"}, [
        div({
            class: () => "searchBoxInput " + (
                options.borderAlwaysVisible === false && !search.active && search.text.length > 0
                    ? "searchBorderOnHover"
                    : "searchBorder"
            ),
        },[
            input ({
                class: "searchBoxHiddenInputText",
                autocomplete: "nope",
                value: toRefs(search).text,
                onkeydown: (e: KeyboardEvent) => {
                    if (e.key === "ArrowDown" && search.selection !== undefined && search.selection < search.results.length - 1) {
                        ++search.selection
                    }
                    else if (e.key === "ArrowUp" && search.selection !== undefined && search.selection > 0) {
                        --search.selection
                    }
                    else if (e.key === "Enter" && options.onSelect !== undefined) {
                        options.onSelect()
                    }
                },
                onfocus: () => {
                    search.active = true
                    if (options.onActive !== undefined) options.onActive()
                },
                onblur: () => {
                    search.text = search.textOnBlur
                    search.active = false
                },
            }),
            p (() => (search.text.length > 0) ? search.text.replace(" ", "\xa0") : "\xa0\xa0", { //nbsp chars
                class: "searchBoxText " + (options.searchTextClass === undefined
                    ? ""
                    : options.searchTextClass
                ),
            }),
        ]),
        div ({class: "searchResultsLocation"}, [ // searchResults div is positioned relative to here
            $if (() => search.active && search.results.length > 0, {
                $then: () => [
                    div ({
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
                                onmouseenter: () => search.selection = result.$index,
                                onclick: options.onSelect === undefined ? null : options.onSelect,
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

const linkItemEl = (item: LinkItem, className: string): HTMLElement =>
    searchBox(item.search, {
        borderAlwaysVisible: false,
        searchTextClass: className,
        onSelect() {
            const search = item.search
            if (search.selection !== undefined) {
                const result = search.results[search.selection]
                item.concept = result.value
                // Keep search result text for display & future editing
                search.text = result.key
                search.textOnBlur = result.key
                search.active = false
            }
        },
    })

const linkEl = (link: Link): HTMLElement =>
    div ({class: "link"}, [
        div({class: "row"}, [
            linkItemEl(link.subject, "subject"),
            linkItemEl(link.relation, "relation"),
            linkItemEl(link.object, "object"),
        ]),
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
        searchBox(state.conceptCreatorSearch, {
            onSelect() {
                const label = state.conceptCreatorSearch.text
                if (label.length > 0) {
                    const outcome = Registry.newConcept(state.conceptRegistry, label)
                    if (typeof outcome === "object") {
                        state.conceptCreatorSearch.text = ""
                    }
                    else {
                        // TODO: Display an error status in the search box
                    }
                }
            },
        }),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

//#endregion
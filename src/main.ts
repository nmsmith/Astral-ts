import "./reset.css"
import "./style.scss"
import "./globals"
import Cycle from "json-cycle"
import { WithDerivedProps, DerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import * as Registry from "./concept-registry"
import { $if, $for, app, div, p, br, button, input, span } from "./libs/lib-view"
import { searchBox, SearchBoxState }from "./views/search-box"

//#region  --- Essential & derived state ---

type Concept = Registry.Concept

type Search = SearchBoxState & {
    selection: number
    registries: Registry.T[]
//derived
    readonly results: Registry.SearchResult[]
}

function Search<Location, Result>(registries: Registry.T[]): Search {
    return {
        active: false,
        text: "",
        textChanged: true,
        selectionCandidate: -1,
        selection: -1,
        registries,
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

const linkItemEl = (item: LinkItem, className: string): HTMLElement =>
    searchBox(item.search, {
        borderAlwaysVisible: false,
        defaultResult: {optionText: "nothing", optionTextStyle: "noConceptOption", inputTextStyle: "labelForNothing"},
        inputTextStyle: className,
        onSelect() {
            const search = item.search
            let newText
            if (search.selectionCandidate >= 0) {
                const result = search.results[search.selectionCandidate]
                item.concept = result.value
                newText = result.key
            }
            else {
                item.concept = undefined
                // We selected nothing, but keep the search text visible
                newText = search.text
            }
            // Keep search result text for display & future editing
            search.text = newText
            search.selection = search.selectionCandidate
            search.textChanged = false
        },
        onNoSelection() {
            const search = item.search
            // If the text was changed, unbind the last concept selected
            if (search.textChanged === true) {
                search.selectionCandidate = -1
                item.concept = undefined
            }
            else {
                search.selectionCandidate = search.selection
            }
        },
    })

const linkEl = (link: Link): HTMLElement =>
    div ({class: "link"}, [
        div ({class: "row"}, [
            linkItemEl (link.subject, "subject"),
            $if (() => link.subject.concept !== undefined, {
                $then: () => [p("*")],
                $else: () => [],
            }),
            div ({class: "linkSpacing"}),
            linkItemEl (link.relation, "relation"),
            $if (() => link.relation.concept !== undefined, {
                $then: () => [p("*")],
                $else: () => [],
            }),
            div ({class: "linkSpacing"}),
            linkItemEl (link.object, "object"),
            $if (() => link.object.concept !== undefined, {
                $then: () => [p("*")],
                $else: () => [],
            }),
        ]),
    ])

app("app",
    div ({class: "view"}, [
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
        p ("Create or find a concept:"),
        searchBox(state.conceptCreatorSearch, {
            blurOnSelect: false,
            defaultResult: {optionText: "new", optionTextStyle: "newConceptOption", inputTextStyle: ""},
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
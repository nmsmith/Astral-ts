import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { WithDerivedProps, DerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import * as Registry from "./concept-registry"
import { $if, $for, app, div, p, br, button, input, span } from "./libs/lib-view"
import { textBox, TextBoxState } from "./views/text-box"
import { searchBox, SearchBoxState } from "./views/search-box"
import { SearchResult } from "./libs/fuzzy-prefix-dict"

//#region  --- Essential & derived state ---

type Concept = Registry.Concept

type SearchState = SearchBoxState<Concept> & {
    registries: Registry.T[]
}

function SearchState<Location, Result>(registries: Registry.T[]): SearchState {
    return {
        selection: {isOccurring: false},
        text: "",
        resultSelected: null,
        // add results & resultSelected as derived state
        registries,
    } as SearchState
}

function searchResults(search: SearchState): Registry.SearchResult[] {
    let searchText: string
    let errorTolerance: number
    if (search.selection.isOccurring && search.selection.textChanged === false) {
        searchText = ""
        errorTolerance = 0
    }
    else {
        searchText = search.text
        errorTolerance = (search.text.length <= 1) ? 0 : 1
    }
    // Search all given registries
    const searchResults: Registry.SearchResult[] = []
    search.registries.forEach(r =>
        searchResults.push(
            ...Registry.findConceptsWithLabelPrefix(r, searchText, errorTolerance)
        )
    )
    // Sort the results by closeness
    if (searchText.length > 1) {
        searchResults.sort((a, b) => a.distance - b.distance)
    }
    // Put the exact match at the top, if any.
    // TODO: If we later allow multiple concepts to have the same label, then
    // this ordering can lead to a hazardous outcome: the wrong concept gets
    // put at the top of the search results, and autocomplete switches it out.
    for (let i = 0; i < searchResults.length; ++i) {
        if (searchResults[i].key === search.text) {
            searchResults.unshift(searchResults.removeAt(i))
            break
        }
    }
    return searchResults
}

interface Fact {
    readonly relation: SearchState
    readonly objects: SearchState[]
}

function Fact(relationRegistry: Registry.T): Fact {
    return {
        relation: SearchState([relationRegistry]),
        objects: [],
    }
}

const factDerivedProps: DerivedProps<Fact> = {
    relation:  { results: searchResults },
    objects: { results: searchResults },
}

interface Rule {
    readonly ruleConcept: Concept // rules are themselves concepts to make them searchable
    readonly labelBoxState: TextBoxState
    readonly varRegistry: Registry.T // for local variables
    readonly head: Fact
    readonly body: Fact[]
}

function Rule(ruleRegistry: Registry.T, relationRegistry: Registry.T): Rule {
    const ruleConcept = Registry.newConcept(ruleRegistry)
    const varRegistry = Registry.empty("var")

    return {
        ruleConcept,
        labelBoxState: {focused: false, text: ruleConcept.label} as TextBoxState,
        varRegistry,
        head: Fact(relationRegistry),
        body: [],
    } as Rule
}

interface RuleView {
    readonly rules: Rule[]
}

interface State {
    readonly relationRegistry: Registry.T
    readonly objectRegistry: Registry.T // the database Domain
    readonly ruleRegistry: Registry.T // for naming and searching for specific rules
    readonly rules: Rule[]
    currentView: RuleView
// derived state
    readonly allRelations: Registry.SearchResult[]
    readonly allObjects: Registry.SearchResult[]
}

function createState(existingState?: State): WithDerivedProps<State> {
    const relationRegistry = Registry.empty("relation")
    const objectRegistry = Registry.empty("object")
    const essentialState = existingState !== undefined ? existingState : {
        relationRegistry,
        objectRegistry,
        ruleRegistry:
            Registry.empty("rule"),
        rules:
            [] as Rule[],
        currentView:
            {rules: []},
        // TODO: Shouldn't require these in the essential state
        allRelations: [],
        allObjects: [],
    }
    return withDerivedProps<State>(essentialState, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        rules: {
            labelBoxState: {
                textIsValid: state => state.text.length > 0,
            },
            head: factDerivedProps,
            body: factDerivedProps,
        },
        allRelations: state => searchResults({
            selection: {isOccurring: false},
            text: "",
            resultSelected: null,
            registries: [state.relationRegistry],
        } as SearchState),
        allObjects: state => searchResults({
            selection: {isOccurring: false},
            text: "",
            resultSelected: null,
            registries: [state.objectRegistry],
        } as SearchState),
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

// By default, load the previous state on page load
localStorage.loadLastState = true

function saveState(): void {
    // If an input element is focused, trigger its blur event
    if (document.activeElement !== null && document.activeElement.tagName === "INPUT") {
        (document.activeElement as HTMLInputElement).blur()
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

function newRule(i: number): void {
    state.rules.insert(i, Rule(state.ruleRegistry, state.relationRegistry))
}

function newPremise(rule: Rule): void {
    rule.body.push(Fact(state.relationRegistry))
}

const relationRefEl = (item: SearchState, className: string): HTMLElement =>
    searchBox (item, {
        borderAlwaysVisible: false,
        inputTextStyle: className,
        unmatchingInputTextStyle: "labelForNothing",
        showNothingOption: {
            text: "nothing",
            textStyle: "labelForNothingOption",
        },
    })

const objectRefEl = (allRefs: SearchState[], thisRef: SearchState, varRegistry: Registry.T, className: string): HTMLElement =>
    searchBox (thisRef, {
        borderAlwaysVisible: false,
        inputTextStyle: className,
        unmatchingInputTextStyle: "labelForNothing",
        showNothingOption: {
            text: "nothing",
            textStyle: "labelForNothingOption",
        },
        onKeyDown(key: string, input: HTMLInputElement) {
            if ((key === "Backspace" || key === "Delete") && thisRef.text === "") {
                // Delete the search box
                allRefs.removeAt(allRefs.indexOf(thisRef))
                return true
            }
            else if (key === ",") {
                // Split the box/text into two search boxes
                const newSearchBox = SearchState([state.objectRegistry, varRegistry])
                if (input.selectionStart !== null) {
                    const beforeComma = thisRef.text.slice(0, input.selectionStart)
                    const afterComma = thisRef.text.slice(input.selectionStart)
                    thisRef.text = beforeComma
                    newSearchBox.text = afterComma
                }
                
                allRefs.insert(allRefs.indexOf(thisRef) + 1, newSearchBox)
                // Proactively blur the box, since it will otherwise be blurred in the middle of the view update (as its siblings are shuffled around).
                // This ensures we update its rendering.
                return true
            }
            else return false
        },
    })

const factEl = (fact: Fact, varRegistry: Registry.T): HTMLElement =>
    div ({class: "fact"}, [
        div ({class: "row"}, [
            relationRefEl (fact.relation, "labelForRelation"),
            span ("(", {class: "factText"}),
            $for (() => fact.objects.slice(0, -1), obj => [
                objectRefEl (fact.objects, obj, varRegistry, "labelForObject"),
                span (",", {class: "factComma"}),
            ]),
            $for (() => fact.objects.slice(-1), obj => [
                objectRefEl (fact.objects, obj, varRegistry, "labelForObject"),
            ]),
            span (")", {class: "factText"}),
            button ("", {
                class: "addObjectToFact",
                onclick: () => fact.objects.push(SearchState([state.objectRegistry, varRegistry])),
            }),
        ]),
    ])

const conceptList = (registry: Registry.T, list: () => Registry.SearchResult[]): HTMLElement =>
    div({}, [
        input ({
            onkeydown: (event: KeyboardEvent) => {
                if (event.key === "Enter") {
                    const label = (event.target as HTMLInputElement).value
                    if (label.length > 0) {
                        
                        // create the new concept
                        const outcome = Registry.newConcept(registry, label)
                        if (typeof outcome === "object") {
                            // clear the box
                            (event.target as HTMLInputElement).value = ""
                        }
                        else {
                            // TODO: Can't use this label; display an error status
                        }
                    }
                }
            },
        }),
        $for (list, result => [
            div ({class: "row"}, [
                span (result.value.label),
                button ("X", {
                    class: "unstyledButton",
                    onclick: () => Registry.deleteConcept(result.value),
                }),
            ]),
        ]),
    ])

// Insert a static toolbar that will be visible even if the app crashes during creation
document.body.prepend(
    div ({class: "toolbar"}, [
        button ("Reset state", {
            onclick: resetState,
        }),
    ]),
    div ({class: "separator"}),
)

app ("app", state,
    div ({class: "view"}, [
        div ({class: "databaseView"}),
        div ({class: "tempView"}, [
            div ({class: "ruleView"}, [
                button ("", {
                    class: "ruleInsertionPoint",
                    onclick: () => newRule(0),
                }),
                $for (() => state.rules, rule => [
                    div ({class: "rule"}, [
                        div ({class: "ruleLabelBox"}, [
                            textBox (rule.labelBoxState, {
                                borderAlwaysVisible: false,
                                inputTextStyle: "ruleLabelText",
                                invalidInputTextStyle: "ruleLabelTextForNothing",
                                onSubmit() {
                                    if (!rule.labelBoxState.textIsValid ||
                                        Registry.setConceptLabel(rule.ruleConcept, rule.labelBoxState.text) !== "success") {
                                            rule.labelBoxState.text = rule.ruleConcept.label
                                    }
                                },
                            }),
                            button ("•••", {
                                class: "ruleDragHandle",
                                onclick: () => state.rules.removeAt(rule.$index),
                            }),
                        ]),
                        div ({class: "ruleContent"}, [
                            factEl (rule.head, rule.varRegistry),
                            div ({class: "ruleBody"}, [
                                $for (() => rule.body, fact => [
                                    factEl (fact, rule.varRegistry),
                                ]),
                                button ("", { 
                                    class: "premiseInsertionPoint",
                                    onclick: () => newPremise(rule),
                                }),
                            ]),
                        ]),
                    ]),
                    button ("", {
                        class: "ruleInsertionPoint",
                        onclick: () => newRule(rule.$index+1),
                    }),
                ]),
            ]),
            div ({class: "separator"}),
            p ("Create a relation:"),
            conceptList (state.relationRegistry, () => state.allRelations),
            p ("Create an object:"),
            conceptList (state.objectRegistry, () => state.allObjects),
            div ({class: "viewBottomPadding"}),
        ]),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

//#endregion
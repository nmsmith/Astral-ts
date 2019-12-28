import "./reset.css"
import "./style.scss"
import "./globals"
import { toRefs, reactive as observable, computed as derivedMalloc, ComputedRef } from "@vue/reactivity"
import {$derived, $if, $for, app, div, p, br, button, input} from "./view-library"
import Cycle from "json-cycle"
import { merge } from "lodash"

import * as IDRegistry from "./id-registry"

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

// eslint-disable-next-line
function copyTree(x: any): any {
    return JSON.parse(JSON.stringify(x))
}

interface ConstRef {
    type: "Const"
    ref: IDRegistry.ID
}

function constRef(ref: IDRegistry.ID): ConstRef {
    return {type: "Const", ref: ref}
}

interface VarRef {
    type: "Var"
    ref: IDRegistry.ID
}

function varRef(ref: IDRegistry.ID): VarRef {
    return {type: "Var", ref: ref}
}

type ConceptRef = ConstRef | VarRef

// TWO WAYS TO INTERPRET "TAGS" (THE PAIRING OF TWO VALUES):
// Related to some topic:    tag / label / class / category
// Part of some collection:  group / collection / set
// Can't this binary relation just be implemented by an EAV with A = "is"?
// Just make sure we have a really concise shorthand for this.

// relation (instance, not class) / connection / edge / link / coupling / pairing / bond
interface Link {
    subject: ConceptRef
    relation: ConceptRef
    object: ConceptRef
}
// out-links, in-links

function link(subject: ConceptRef, relation: ConceptRef, object: ConceptRef): Link {
    return {subject: subject, relation: relation, object: object}
}

interface Rule {
    //idRegistry: IDRegistry<VarID>  for local variables
    id: number
    head: string //head?: Link
    body: string //Link[]
}

interface RuleView {
    rules: Rule[]
}

// N.B. The State should be pure data. To ensure serializability
// & deserializability, there should be no functions or methods
// anywhere in the state.
type State = {
    conceptRegistry: IDRegistry.T
    ruleRegistry: IDRegistry.T
    rules: Rule[]
    currentView: RuleView
    conceptInputState: {
        text: string
        selection: number
    }
}

function initialState(): State {
    return {
        conceptRegistry: IDRegistry.empty(),
        ruleRegistry: IDRegistry.empty(),
        rules: [],
        currentView: {rules: []},
        conceptInputState: {
            text: "",
            selection: 0,
        },
    }
}

// Set up fresh state
const state: State = observable(initialState())

// Load previous state, if applicable
if (   localStorage.loadLastState === "true"
    && localStorage.state !== undefined
    && localStorage.state !== "undefined"
) {
    // Deeply replace each property of the state with those loaded from storage.
    // Note: if we need to customize the merging behaviour then Lodash also has a "mergeWith" fn.
    merge(state, Cycle.retrocycle(JSON.parse(localStorage.state)))
}

// Expose a reference to the state for debugging
console.log("App state: ", state)

function saveState(): void {
    // TODO: Have data auto-save periodically (every 10 sec?)
    localStorage.state = JSON.stringify(Cycle.decycle(state))
}

function resetState(): void {
    localStorage.loadLastState = false
    location.reload()
}

// Save on quit, and load on start
window.addEventListener("beforeunload", saveState)
localStorage.loadLastState = true

function newRule(i: number): void {
    const id = IDRegistry.newID(state.ruleRegistry, state.conceptInputState.text)
    //state.rules.insert(i, {id: id, body: []})
    state.rules.insert(i, {id: id, head: id.toString(), body: ""})
}

const searchMatches: ComputedRef<IDRegistry.SearchResult[]> =
    derivedMalloc(() => {
        const text = state.conceptInputState.text
        const errorTolerance = (text.length <= 1) ? 0 : 1
        const searchResults = IDRegistry.getMatchesForPrefix(state.conceptRegistry, text, errorTolerance)
        searchResults.sort((a, b) => a.distance - b.distance)
        return searchResults
    })

function selectPrevious(): void {
    if (state.conceptInputState.selection > 0) {
        --state.conceptInputState.selection
    }
}

function selectNext(): void {
    if (state.conceptInputState.selection < searchMatches.value.length - 1) {
        ++state.conceptInputState.selection
    }
}

function createConcept(): void {
    if (state.conceptInputState.text.length > 0) {
        IDRegistry.newID(state.conceptRegistry, state.conceptInputState.text)
        state.conceptInputState.text = ""
        state.conceptInputState.selection = 0
    }
}

// ----- THE APP VIEW -----

app("app",
    div ({
        className: "matchParentSize col",
    },[
        div ({
            className: "toolbar",
        },[
            button ("Reset state", {
                onclick: resetState,
            }),
        ]),
        div ({
            className: "database",
        },[
            div ({
                className: "insertHere",
                onclick: () => newRule(0),
            }),
            $for (state.rules, rule => [
                div ({
                    className: "row",
                },[
                    input ({
                        autocomplete: "nope",
                        value: toRefs(rule).head,
                    }),
                    p ("if"),
                    input ({
                        autocomplete: "nope",
                        value: toRefs(rule).body,
                    }),
                ]),
                div ({
                    className: "insertHere",
                    onclick: () => newRule(rule.$index+1),
                }),
            ]),
            br (),
            p ("Create a new concept:"),
            input ({
                autocomplete: "nope",
                value: toRefs(state.conceptInputState).text,
                onkeydown: (e: KeyboardEvent) => {
                    if (e.key === "ArrowDown") selectNext()
                    else if (e.key === "ArrowUp") selectPrevious()
                    else if (e.key === "Enter") createConcept()
                },
            }),
            $for (searchMatches, match => [
                p ($derived(() => `${match.key} [${match.value}]`), {
                    className:
                        $if (() => match.$index === state.conceptInputState.selection, {
                            _then: () => "suggestionBox highlighted",
                            _else: () => "suggestionBox",
                        }),
                }),
            ]),
        ]),
    ])
)
import "./reset.css"
import "./style.scss"
import "./globals"
import { Ref, toRefs, reactive, computed } from "@vue/reactivity"
import {div, box, p, br, button, input} from "./view-library"
import Cycle from "json-cycle"

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
    count: string
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
        count: "x",
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

const state = reactive(initialState())

function saveState(): void {
    // TODO: Have data auto-save periodically (every 10 sec?)
    localStorage.state = JSON.stringify(Cycle.decycle(state))
}
function resetState(): void {
    // Assign each property value of initialState to the current state.
    Object.assign(state, initialState())
}

const saveAndRestoreAutomatically = true

if (saveAndRestoreAutomatically) window.addEventListener("beforeunload", saveState)

function newRule(i: number): void {
    const id = IDRegistry.newID(state.ruleRegistry, state.conceptInputState.text)
    state.rules.insert(i, {id: id, body: []})
}

const appView =
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
            className: "database col",
        },[
            p (toRefs(state).count),
            button("Increment", {
                onclick: () => (state.count += " x"),
            }),
            box ({
                className: "insertHere",
                onclick: () => newRule(0),
            }),
            br (),
            p ("Create a new concept:"),
            input ({
                autocomplete: "nope",
                value: toRefs(state.conceptInputState).text,
                valueChanged: v => state.conceptInputState.text = v,
            }),
            button("Set to Hello", {
                onclick: () => state.conceptInputState.text = "Hello",
            }),
            p (toRefs(state.conceptInputState).text),
        ]),
    ])

document.body.append(appView)



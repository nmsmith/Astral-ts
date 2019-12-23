import "./reset.css"
import "./style.scss"
import { Ref, ref, reactive, toRefs, computed, effect } from "@vue/reactivity"
import {scheduleEffect, div, p, button} from "./view-library"

import "./types/globals"
import * as IDRegistry from "./id-registry"

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

// Define array insert
Array.prototype.insert = function<T>(index: number, item: T): T[] {
    return this.splice(index, 0, item)
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
    subjectRegistry: IDRegistry.T
    ruleRegistry: IDRegistry.T
    rules: Rule[]
    currentView: RuleView
    subjectInputState: {
        text: string
        selection: number
    }
}

function initialState(): State {
    return {
        subjectRegistry: IDRegistry.empty(),
        ruleRegistry: IDRegistry.empty(),
        rules: [],
        currentView: {rules: []},
        subjectInputState: {
            text: "",
            selection: 0,
        },
    }
}

const saveAndRestoreAutomatically = true

const state = reactive({count: 0})

const items: Ref<HTMLElement[]> = ref([])

// TODO: Which JS objects actually have a toString() method?
export function str(value: number | boolean): string {
    return value.toString()
}

const view = div(
    {},
    ref([
        p(toRefs(state).count),
        button(
            {onClick: () => ++state.count},
            "Increment"
        ),
        button(
            {onClick: () => items.value.push(p("item"))},
            "Add item"
        ),
        div({}, items),
    ])
)

document.body.append(view)



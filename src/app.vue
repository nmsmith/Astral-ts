<template lang="pug" src="./view.pug"></template>
<style lang="scss" src="./style.scss"></style>
<script lang="ts">
import Vue from "vue"
import "./types/globals"
import * as IDRegistry from "./id-registry"

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

// Define array assignment (that Vue can react to)
Array.prototype.set = function<T>(index: number, value: T): void {
    Vue.set(this, index, value)
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

type Ref = ConstRef | VarRef

// TWO WAYS TO INTERPRET "TAGS" (THE PAIRING OF TWO VALUES):
// Related to some topic:    tag / label / class / category
// Part of some collection:  group / collection / set
// Can't this binary relation just be implemented by an EAV with A = "is"?
// Just make sure we have a really concise shorthand for this.

// relation (instance, not class) / connection / edge / link / coupling / pairing / bond
interface Link {
    subject: Ref
    relation: Ref
    object: Ref
}
// out-links, in-links

function link(subject: Ref, relation: Ref, object: Ref): Link {
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

/// --- CUSTOM DIRECTIVES ---
Vue.directive("focus", {
  // When the bound element is inserted into the DOM
  inserted: function (el) {
      console.log("element inserted")
    // Focus the element
    el.focus()
  },
})

const saveAndRestoreAutomatically = true

// --- MAIN APPLICATION LOGIC ---
import {createComponent, ref, reactive, toRefs, computed, watch, Ref as VRef} from "@vue/composition-api"
import Cycle from "json-cycle"
export default createComponent({
    setup() {
        const state: State = reactive(initialState())
        // const freshState = initialState()
        // // If applicable, load existing state from local storage
        // if (saveAndRestoreAutomatically && localStorage.state !== undefined && localStorage.state !== "undefined") {
        //     const restoredState = Object.assign(freshState, Cycle.retrocycle(JSON.parse(localStorage.state)))
        //     restoredState.insertingRule = null
        //     return restoredState
        // }
        // else {
        //     return freshState
        // }
        const stateActions = {
            save(): void {
                // TODO: Have data auto-save periodically (every 10 sec?)
                localStorage.state = JSON.stringify(Cycle.decycle(state))
            },
            reset(): void {
                // Assign each property value of initialState to the current state.
                Object.assign(state, initialState())
            },
        }

        if (saveAndRestoreAutomatically) window.addEventListener("beforeunload", stateActions.save)





        

        const rule = {
            actions: {
                newRule(i: number): void {
                    const id = IDRegistry.newID(state.ruleRegistry, state.subjectInputState.text)
                    state.rules.insert(i, {id: id, body: []})
                },
            },
        }

        return {
            ...toRefs(state),
            subjectInput,
            ...subject.computed,
            ...subject.actions,
            ...rule.actions,
        }
    },
})
</script>
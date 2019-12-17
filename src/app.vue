<template lang="pug" src="./view.pug"></template>
<style lang="scss" src="./style.scss"></style>
<script lang="ts">

import "./types/globals"

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

type EntityUUID = number
type VarID = number

interface ConstRef {
    type: "Const"
    ref: EntityUUID
}

function constRef(ref: EntityUUID): ConstRef {
    return {type: "Const", ref: ref}
}

interface VarRef {
    type: "Var"
    ref: VarID
}

function varRef(ref: VarID): VarRef {
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
    head?: Link
    body: Link[]
}

interface RuleView {
    rules: Rule[]
}

import * as IDRegistry from "./id-registry"

interface State {
    idRegistry: IDRegistry.T<EntityUUID>
    currentView: RuleView
    insertingRule: {at: number, text: string} | null
    constantInputText: string
}

function initialState(): State {
    return {
        idRegistry: IDRegistry.empty(),
        currentView: {rules: []},
        insertingRule: null,
        constantInputText: "",
    }
}

// --- GLOBAL CONSTANTS ---
const saveAndRestoreAutomatically = true

import Vue from "vue"
import Cycle from "json-cycle"
export default Vue.extend({
    name: "App",
    data(): State {
        const freshState = initialState()
        // If applicable, load existing state from local storage
        if (saveAndRestoreAutomatically && localStorage.state !== undefined && localStorage.state !== "undefined") {
            const restoredState = Object.assign(freshState, Cycle.retrocycle(JSON.parse(localStorage.state)))
            restoredState.insertingRule = null
            return restoredState
        }
        else {
            return freshState
        }
    },
    // Derived state values. These are cached. Read-only by default, but you can add setters.
    computed: {
        dbEntryCount(): number { // Taking into account a "new rule" slot
           return 0 //return this.currentDB.rules.length + ((this.insertingRule === null) ? 0 : 1)
        },
        searchMatches(): EntityUUID[] {
            const id = IDRegistry.getID(this.idRegistry, this.constantInputText)
            if (id === undefined) {
                return []
            }
            else {
                return [id]
            }
        }
    },
    // A method that runs on app start. Can be used to perform external effects.
    created(): void {
        // Set up save-on-close behaviour
        if (saveAndRestoreAutomatically) window.addEventListener("beforeunload", this.saveState)
    },
    // Methods should (only) be used to perform a state transition or an external effect.
    // They are useful for polling external state. Return values are not cached.
    methods: {
        newRule(i: number): void {
            this.insertingRule = {at: i, text: ""}
            this.$nextTick(() => {
                return (this.$refs.ruleInput as HTMLInputElement[])[0].focus()
            })
        },
        constantCreated(): void {
            if (this.constantInputText.length > 0) {
                IDRegistry.newID(this.idRegistry, this.constantInputText)
            }
        },
        ruleAdded(): void {
            // if (this.insertingRule !== null) {
            //     this.currentDB.rules.insert(this.insertingRule.at, this._getRuleInput().value)
            //     this.insertingRule = null
            // }
        },
        saveState(): void {
            // TODO: Have data auto-save periodically (every 10 sec?)
            localStorage.state = JSON.stringify(Cycle.decycle(this.$data))
        },
        resetState(): void {
            // Assign each property value of initialState to the current state.
            Object.assign(this.$data, initialState())
        },
    },
    // For running external effects when a "data" or "computed" property changes.
    // Use this over a computed property if you need to perform asynchronous work (e.g. an API call).
    // This is an imperative event-response model.
    watch: {
    },
})

</script>
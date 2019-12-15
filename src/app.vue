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

const saveAndRestoreAutomatically = true

interface Database {
    name: string;
    rules: string[];
}

interface State {
    databases: Database[];
    currentDB: Database;
    insertingRule: {at: number; text: string} | null;
}

function initialState(): State {
    const defaultDB: Database = {
        name: "Default",
        rules: ["rule 1", "rule 2", "rule 3"]
    }

    const anotherDB: Database = {
        name: "Other",
        rules: ["banana"]
    }

    return {
        databases: [defaultDB, anotherDB],
        currentDB: defaultDB,
        insertingRule: null,
    }
}

// Vue.extend helps TypeScript figure out that this is a Vue view,
// enabling type-checking of how the view is used (esp. for "this").
import Vue from "vue"
import Cycle from "json-cycle"
export default Vue.extend({
    name: "App",
    data() {
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
            return this.currentDB.rules.length + ((this.insertingRule === null) ? 0 : 1)
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
        showDB(i: number): void {
            this.currentDB = this.databases[i]
            this.insertingRule = null
        },
        _getRuleInput(): HTMLInputElement {
            return (this.$refs.ruleInput as HTMLInputElement[])[0]
        },
        newRule(i: number): void {
            this.insertingRule = {at: i, text: ""}
            this.$nextTick(() => {
                return this._getRuleInput().focus()
            })
        },
        ruleAdded(): void {
            if (this.insertingRule !== null) {
                this.currentDB.rules.insert(this.insertingRule.at, this._getRuleInput().value)
                this.insertingRule = null
            }
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
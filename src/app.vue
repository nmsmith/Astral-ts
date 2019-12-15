<template lang="pug" src="./view.pug"></template>
<style lang="scss" src="./style.scss"></style>
<script lang="ts">

import JSON from "json-decycle"

// eslint-disable-next-line
function copyTree(x: any): any {
    return JSON.parse(JSON.stringify(x))
}

interface Database {
    name: string;
    rules: string[];
}

interface State {
    databases: Database[];
    currentDB: Database;
    // eslint-disable-next-line
    toJSON(): any;
}

const saveAndRestoreAutomatically = false

window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

import Vue from "vue"

// Vue.extend helps TypeScript figure out that this is a Vue view,
// enabling type-checking of how the view is used (esp. for "this").
export default Vue.extend({
    //el: "#app",
    name: "App",
    // "Essential" state values.
    data(): State {
        // Define initial state and load previous from memory
        const defaultDB: Database = {
            name: "Default",
            rules: ["rule 1", "rule 2", "rule 5"]
        }

        const anotherDB: Database = {
            name: "Other",
            rules: ["banana"]
        }

        const initialState: State = {
            databases: [defaultDB, anotherDB],
            currentDB: defaultDB,
            toJSON() {
                return this
            },
        }

        return (saveAndRestoreAutomatically && localStorage.state && localStorage.state != "undefined")
            ? {...initialState, ...JSON.retrocycle(JSON.parse(localStorage.state))}
            : initialState
    },
    // Derived state values. These stay cached once computed.
    // These are read-only by default, but you can add setters as well.
    computed: {
        totalProducts(): number {
            return 0 //return this.products.reduce((curr, x) => curr + x)
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
        },
        newRule(i: number): void {
            this.currentDB.rules.splice(i, 0, "inserted!")
        },
        saveState(): void {
            // TODO: Have data auto-save periodically (every 10 sec?)
            localStorage.state = JSON.stringify(JSON.decycle(this.$data))
        },
    },
    // For running external effects when a "data" or "computed" property changes.
    // Use this over a computed property if you need to perform asynchronous work (e.g. an API call).
    // This is an imperative event-response model.
    watch: {
    },
})

</script>
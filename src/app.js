'use strict'
/* global Vue */

Vue.component('thing', {
    props: ['x'],
    template: '<li>The current count is {{ x }}</li>'
})

let restoredState
let saveAndRestoreAutomatically = true

// Define initial state and load previous from memory
{
    let products = [{x: 3}, {y: 9}, {z: 0}, {w: 0}]
    
    let initialState = {
        item: 'Thing',
        products: products,
        count: 0,
        cursor: products[0],
        toJSON () {
            return this
        },
    }
    
    restoredState = (saveAndRestoreAutomatically && localStorage.state && localStorage.state != "undefined")
        ? {...initialState, ...JSON.retrocycle(JSON.parse(localStorage.state))}
        : initialState
}

new Vue({
    el: '#app',
    // "Essential" state values.
    data: restoredState,
    // Derived state values. These stay cached once computed.
    // These are read-only by default, but you can add setters as well.
    computed: {
        totalProducts () {
            return this.products.reduce((curr, x) => curr + x)
        }
    },
    // A method that runs on app start. Can be used to perform external effects.
    created () {
        // Set up save-on-close behaviour
        if (saveAndRestoreAutomatically) window.addEventListener('beforeunload', this.saveState)
        this.cursor = this.products[0]
    },
    // Methods should (only) be used to perform a state transition or an external effect.
    // They are useful for polling external state. Return values are not cached.
    methods: {
        increment () {
            this.cursor.x += 1
        },
        saveState () {
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
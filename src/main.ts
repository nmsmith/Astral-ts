import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs } from "@vue/reactivity"
import { WithDerivedProps, DerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import * as Registry from "./concept-registry"
import { $if, $for, app, div, p, br, button, input, textarea, span } from "./libs/lib-view"
import { textBox, TextBoxState } from "./views/text-box"

//#region  --- Essential & derived state ---
interface Fact {
    readonly relation: string
    readonly objects: string[]
}

interface Rule {
    readonly label: string,
    readonly rawText: string
    readonly lastParsed: null | {
        readonly rawText: string
        readonly head: Fact
        readonly body: Fact[]
    }
}

function Rule(): Rule {
    return {
        label: "",
        rawText: "",
        lastParsed: null,
    }
}

interface State {
    readonly rules: Rule[]
}

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        rules:
            [] as Rule[],
    }
    return withDerivedProps<State>(essentialState, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        
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
    state.rules.insert(i, Rule())
}

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

type ParseResult = {result: "failure", reason: string} | {result: "success"}

function parseRule(s: string): ParseResult {
    if (s === "") {
        return {result: "failure", reason: "Nothing entered."}
    }
    else {
        return {result: "success"}
    }
}

// Hack to prevent textareas from auto-inserting a tab char if the user is trying to delete it
let deletingText = false

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
                        div ({class: "ruleLabelBar"}, [
                            input ({
                                class: "ruleLabelText",
                                value: toRefs(rule).label,
                            }),
                            button ("•••", {
                                class: "ruleDragHandle",
                                onclick: () => state.rules.removeAt(rule.$index),
                            }),
                        ]),
                        textarea ({
                            class: "ruleTextArea",
                            value: toRefs(rule).rawText,
                            onkeydown: (event: KeyboardEvent) => {
                                deletingText = (event.key === "Backspace" || event.key === "Delete")
                            },
                            oninput: (event: Event) => {
                                const el = (event.target as HTMLTextAreaElement)
                                if (!deletingText) {
                                    // Auto-insert a tab character if necessary
                                    const fixedText = rule.rawText.replace(/\n([^\t]|$)/g, "\n\t$1")
                                    if (fixedText !== el.value) {
                                        toRefs(rule).rawText.value = fixedText
                                        const start = el.selectionStart
                                        const end = el.selectionEnd
                                        setTimeout(() => {
                                            // Move cursor position past inserted Tab
                                            el.selectionStart = start+1
                                            el.selectionEnd = end+1
                                        }, 0)
                                    }
                                }
                                const parseResult = parseRule(rule.rawText)
                                // resize the box to fit its contents
                                el.style.height = "auto"
                                el.style.height = el.scrollHeight + "px"
                            },
                        }),
                    ]),
                    button ("", {
                        class: "ruleInsertionPoint",
                        onclick: () => newRule(rule.$index+1),
                    }),
                ]),
            ]),
            div ({class: "separator"}),
            div ({class: "viewBottomPadding"}),
        ]),
    ])
)

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

// Hack to make textareas stretch to fit content
const textAreas = document.getElementsByTagName("textarea")
for (let i = 0; i < textAreas.length; i++) {
    textAreas[i].style.height = textAreas[i].scrollHeight + "px"
}

//#endregion
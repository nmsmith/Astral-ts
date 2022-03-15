import "./styles/reset.css"
import "./styles/general.css"
import "./globals"
import {Rule, analyseRuleGraph, Component, RuleGraphInfo, Relation, componentOf, computeDerivations, TupleLookup, Tuple, Derivations, TupleWithDerivations } from "./semantics"

// I'll have to find a way to structure my app's state that only includes TREE structures.
// (json-cycle can't handle Sets and Maps, but vanilla JSON.stringify can with a "replacer")
type State = {}

function createState(existingState?: State): State {
    if (existingState !== undefined) {
        return existingState
    } else {
        return {}
    }
}

const state: State =
    // Load previous state, if applicable
    (   localStorage.loadLastState === "true"
     && localStorage.state !== undefined
     && localStorage.state !== "undefined"
    )
    ? createState(JSON.parse(localStorage.state, (key: string, value: unknown): unknown => {
        // Parse ES6 Sets and Maps
        if (value instanceof Set) {
            return {
            dataType: "Set",
            value: Array.from(value.values()),
            }
        } else if (value instanceof Map) {
            return {
                dataType: "Map",
                value: Array.from(value.entries()),
            }
        }
        else return value
    }))
    : createState()
console.log("App state:", state)

//#endregion
//#region  --- State initialization, saving and loading ---

// By default, load the previous state on page load
localStorage.loadLastState = true
localStorage.saveState = true

function saveState(): void {
    if (localStorage.saveState === "false") return
    // If an input element is focused, trigger its blur event
    if (document.activeElement !== null && document.activeElement.tagName === "INPUT") {
        (document.activeElement as unknown as HTMLInputElement).blur()
    }
    //eslint-disable-next-line
    localStorage.state = JSON.stringify(state, (key: string, value: any): unknown | Map<unknown, unknown> => {
        // Stringify ES6 Sets and Maps
        if(typeof value === "object" && value !== null) {
            if (value.dataType === "Set") {
                return new Set(value.value)
            } else if (value.dataType === "Map") {
                return new Map(value.value)
            }
        }
        return value
    })
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

// Disable right-click menu
window.oncontextmenu = (e: Event): void => {
    e.preventDefault()
}

const canvas = document.getElementById("app-canvas") as HTMLCanvasElement
const context = canvas.getContext("2d") as CanvasRenderingContext2D

// Draws Astral's GUI.
function drawGUI(): void {
    context.strokeStyle = "blue"
    context.lineWidth = 5
    context.strokeRect(0, 0, window.innerWidth, window.innerHeight)
}

// Redraw whenever the window is resized
function onCanvasResize(): void {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    drawGUI()
}

window.addEventListener("resize", onCanvasResize, false)

// Draw the first frame
onCanvasResize()

//#endregion
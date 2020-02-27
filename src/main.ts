import "./reset.css"
import "./styles/styles.scss"
import "./globals"
import Cycle from "json-cycle"
import { toRefs } from "@vue/reactivity"
import { WithDerivedProps, withDerivedProps } from "./libs/lib-derived-state"
import { $if, $for, app, div, p, button, input, textarea, span, h1, h2, br } from "./libs/lib-view"
import * as cytoscape from "cytoscape"
//import cola from "cytoscape-cola"
import klay from "cytoscape-klay"
import {parseRule} from "./parser"
import {Rule, relationDependencyGraph, Component, RecursiveGroup} from "./semantics"

//#region  --- Essential & derived state ---

interface RuleEditor {
    readonly label: string
    readonly rawText: string
    errorText: string | null
    lastParsed: null | {
        readonly rawText: string
        readonly rule: Rule
        // This is technically derived state, but it's too annoying to try and
        // manage that given Cytoscape is not part of our incremental library.
        cytoElements: cytoscape.Collection
    }
}

function RuleEditor(): RuleEditor {
    return {
        label: "",
        rawText: "",
        errorText: null,
        lastParsed: null,
    }
}

interface State {
    readonly rules: RuleEditor[]
// derived state
    readonly relationDepGraph: Component[]
    readonly groupsWithInternalNegation: {errorText: string}[]
}

function createState(existingState?: State): WithDerivedProps<State> {
    const essentialState = existingState !== undefined ? existingState : {
        rules:
            [] as RuleEditor[],
        // Derived state (to be overwritten):
        relationDepGraph: [],
        groupsWithInternalNegation: [],
    }
    return withDerivedProps<State>(essentialState, {
        /* eslint-disable @typescript-eslint/explicit-function-return-type */
        relationDepGraph: state => {
            const rawRules: Rule[] = []
            state.rules.forEach(r => {
                if (r.lastParsed !== null) rawRules.push(r.lastParsed.rule)
            })
            return relationDependencyGraph(rawRules)
        },
        groupsWithInternalNegation: state => {
            const badGroups: {errorText: string}[] = []
            state.relationDepGraph.forEach(component => {
                if (component.type !== "recursiveGroup") return // try next component
                for (const relation of component.relations) {
                    for (const rule of state.rules) {
                        if (rule.lastParsed !== null && rule.lastParsed.rule.head.relation === relation) {
                            for (const fact of rule.lastParsed.rule.body) {
                                if (fact.sign === "negative" && component.relations.has(fact.relation)) {
                                    let errorText = ""
                                    component.relations.forEach(r => errorText += r + ", ")
                                    badGroups.push({errorText})
                                    return // Move into next component
                                }
                            }
                        }
                    }
                }
            })
            return badGroups
        },
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


cytoscape.use(klay)
// eslint-disable-next-line prefer-const
let cyto: cytoscape.Core
const layoutType = {
    name: "klay",
    animate: true,
    klay: {
        direction: "RIGHT",
        spacing: 40,
    },
    //flow: { axis: "x", minSeparation: 200 },
    //alignment: (node: cytoscape.NodeDefinition) => { return { x: 400 }},
}
let cytoID = 0
// We need to do this stupid administration because Cyto
// isn't a declarative API: we need to know when relation
// nodes should be added or removed.
const relationRefCounts = new Map<string, number>()
const relationNodes = new Map<string, cytoscape.Collection>()

function updateCytoElements<NewStuff extends {readonly rule: Rule}>(
    oldStuff: {readonly rule: Rule, cytoElements: cytoscape.Collection} | null,
    newStuff: NewStuff | null,
): NewStuff | undefined {
    // --- PART 1: RELATION TRACKING ---
    // Keep track of how the number of references to relations
    // change as this rule is updated, so we know what nodes
    // need to be added and deleted from the Cyto graph.
    const relationRefDeltas = new Map<string, number>()
    // Count the relations getting removed
    if (oldStuff !== null) {
        const lastHead = oldStuff.rule.head.relation
        relationRefDeltas.set(lastHead, -1)
        oldStuff.rule.body.forEach(premise => {
            const currDelta = relationRefDeltas.get(premise.relation)
            if (currDelta === undefined) {
                relationRefDeltas.set(premise.relation, -1)
            }
            else {
                relationRefDeltas.set(premise.relation, currDelta - 1)
            }
        })
    }
    // Count the relations getting added
    if (newStuff !== null) {
        const headRelation = newStuff.rule.head.relation
        const currDelta = relationRefDeltas.get(headRelation)
        if (currDelta === undefined) {
            relationRefDeltas.set(headRelation, 1)
        }
        else {
            relationRefDeltas.set(headRelation, currDelta + 1)
        }
        newStuff.rule.body.forEach(premise => {
            const currDelta = relationRefDeltas.get(premise.relation)
            if (currDelta === undefined) {
                relationRefDeltas.set(premise.relation, 1)
            }
            else {
                relationRefDeltas.set(premise.relation, currDelta + 1)
            }
        })
    }
    // Add nodes for any relations which aren't already in the graph
    relationRefDeltas.forEach((delta, key) => {
        const currCount = relationRefCounts.get(key)
        if (currCount === undefined || currCount === 0) {
            // Delta must be positive
            relationRefCounts.set(key, delta)
            relationNodes.set(key, cyto.add({ data: { id: key }, classes: "relation" }))
        }
        else if (currCount + delta === 0) {
            relationRefCounts.delete(key)
            cyto.remove(relationNodes.get(key) as cytoscape.Collection)
            relationNodes.delete(key)
        }
        else {
            relationRefCounts.set(key, currCount + delta)
        }
    })

    // --- PART 2: NODES FOR THIS RULE ---
    // Remove old nodes
    if (oldStuff !== null) cyto.remove(oldStuff.cytoElements)
    if (newStuff !== null) {
        // Add a graph node for the rule head
        const elementsToAdd: cytoscape.ElementDefinition[] = []
        const headID = cytoID++
        elementsToAdd.push({ data: { id: headID.toString(), parent: newStuff.rule.head.relation } })
        for (const premise of newStuff.rule.body) {
            // Add an edge for each premise
            elementsToAdd.push({ data: { id: (cytoID++).toString(), source: premise.relation, target: headID }})
        }
        let cytoElements = cyto.add(elementsToAdd)
        // Store the attached elements so they can be deleted later
        return Object.defineProperty(newStuff, "cytoElements", {
            get() {return cytoElements},
            set(e) {cytoElements = e},
            enumerable: false, // Prevent this property from being serialized
        })
    }
}

function newRule(i: number): void {
    state.rules.insert(i, RuleEditor())
}

// Insert a static toolbar that will be visible even if the app crashes during creation
document.body.prepend(
    div ({class: "toolbar"}, [
        button ("Reset state", {
            onclick: resetState,
        }),
    ]),
    div ({class: "separator"}),
)

const graphRoot = div ({class: "graphRoot"})

app ("app", state,
    div ({class: "view"}, [
        div ({class: "graphView"}, [
            h1 ("Dataflow view"),
            h2 ("Development: incremental, spatially composable."),
            p ("You can always see/visualize the effect of what adding or removing a piece will be (like Factorio)."),
            br (),
            graphRoot,
            $for (() => state.relationDepGraph, component => [
                component.type === "node"
                    ? p (component.relation, {class: "nodeComponent"})
                    : div ({class: "recursiveGroupComponent"}, [
                        span("⮕"),
                        div({class: "spacer"}),
                        $for (() => Array.from(component.relations).map(r => {return {relation: r}}), o => [
                            span(o.relation + ","),
                            div({class: "spacer"}),
                        ]),
                      ]),
            ]),
        ]),
        div ({class: "ruleView"}, [
            p ("EVENT LIST (moments in time):"),
            p ("_"),
            p ("At each moment:"),
            $for (() => state.groupsWithInternalNegation, o => [
                p (() => `The following recursive group has internal negation: ${o.errorText}`, {
                    class: "errorText",
                }),
            ]),
            button ("", {
                class: "ruleInsertionPoint",
                onclick: () => newRule(0),
            }),
            $for (() => state.rules, rule => [
                div ({class: "rule"}, [
                    div ({class: "ruleSummaryBar"}, [
                        div ({class: "ruleType"}, [
                            p ("event/state"),
                        ]),
                        input ({
                            class: "ruleLabelText",
                            autocomplete: "nope",
                            autocapitalize: "off",
                            value: toRefs(rule).label,
                        }),
                        button ("•••", {
                            class: "ruleDragHandle",
                            onclick: () => state.rules.removeAt(rule.$index),
                        }),
                    ]),
                    div ({class: "row"}, [
                        div ({class: "timeColumn"}, [
                            div ({class: "row"}, [
                                p ("at time ", {class: "relationText"}),
                                p ("t", {class: "objectText"}),
                                p(",", {class: "relationText"}),
                            ]),
                            div ({class: "row"}, [
                                p ("at time ", {class: "relationText"}),
                                p ("t", {class: "objectText"}),
                                p(",", {class: "relationText"}),
                            ]),
                        ]),
                        div ({class: "ruleTextDiv"}, [
                            textarea ({
                                class: "ruleTextArea",
                                value: toRefs(rule).rawText,
                                onkeydown: (event: KeyboardEvent) => {
                                    const el = (event.target as HTMLTextAreaElement)
                                    // React to vanilla key presses only
                                    if (!event.ctrlKey && !event.metaKey) {
                                        // Do basic autoformatting.
                                        // Note: execCommand() is needed to preserve the browser's undo stack, and setTimeout() prevents a nested DOM update.
                                        if (event.key === ",") {
                                            event.preventDefault()
                                            setTimeout(() =>
                                                document.execCommand("insertText", false, ", "), 0)
                                        }
                                        else if (event.key === "Enter") {
                                            event.preventDefault()
                                            setTimeout(() =>
                                                document.execCommand("insertText", false, "\n  "), 0)
                                        }
                                        else if (event.key === "-") {
                                            event.preventDefault()
                                            setTimeout(() =>
                                                document.execCommand("insertText", false, "¬"), 0)
                                        }
                                        // Disallow spaces next to an existing space, unless at the start of a line
                                        else if (
                                            event.key === " " && !(
                                                el.selectionStart >= 1 && rule.rawText[el.selectionStart-1] === "\n"
                                            ) && !(
                                                el.selectionStart > 1 && rule.rawText[el.selectionStart-2] === "\n"
                                            ) && (
                                                (el.selectionStart >= 1 && rule.rawText[el.selectionStart-1] === " ") || (el.selectionEnd < rule.rawText.length && rule.rawText[el.selectionEnd] === " ")
                                            )
                                        ) {
                                            event.preventDefault()
                                        }
                                    }
                                },
                                oninput: (event: Event) => {
                                    const el = (event.target as HTMLTextAreaElement)
                                    const parseResult = parseRule(rule.rawText)
                                    if (parseResult.result === "success") {
                                        // Update rule data
                                        const newLastParsed = {rawText: rule.rawText, rule: parseResult.rule}
                                        // Update the graph representation of the rule data
                                        rule.lastParsed = updateCytoElements(rule.lastParsed, newLastParsed) as any
                                        rule.errorText = null
                                        // Update the graph layout
                                        cyto.layout(layoutType).run()
                                    }
                                    else if (parseResult.result === "noRule") {
                                        updateCytoElements(rule.lastParsed, null)
                                        rule.lastParsed = null
                                        rule.errorText = null
                                    }
                                    else {
                                        rule.errorText = parseResult.reason
                                    }
                                    // resize the box to fit its contents
                                    el.style.height = "auto"
                                    el.style.height = el.scrollHeight + "px"
                                },
                            }),
                            $if (() => rule.errorText !== null, {
                                $then: () => [
                                    p (() => rule.errorText as string, {
                                        class: "errorText",
                                    }),
                                ],
                                $else: () => [],
                            }),
                        ]),
                        div ({class: "decompressionPane"}, [
                            //p ("likes(#bob, #jill)"),
                        ]),
                    ]),
                ]),
                button ("", {
                    class: "ruleInsertionPoint",
                    onclick: () => newRule(rule.$index+1),
                }),
            ]),
            p ("NEXT: (for now, use NEXT for state only, and don't allow derived events)"),
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

// Set up Cytoscape
cyto = cytoscape({
    container: graphRoot,
    elements: { // list of graph elements to start with
        nodes: [
            // { // node a
            //     data: { id: "a", parent: "likes" },
            // },
            // { // node b
            //     data: { id: "b", parent: "likes" },
            // },
            // {
            //     data: { id: "likes" },
            //     classes: "relation",
            // },
        ],
        edges: [
            // { // edge ab
            //     data: { id: "ab", source: "a", target: "b" },
            // },
        ],
    },
    style: [ // the stylesheet for the graph
        {
            selector: "node",
            style: {
                "background-color": "#666",
                "label": "data(id)",
            },
        },
        {
            selector: "edge",
            style: {
                "width": 3,
                //"line-color": "#ccc",
                //"target-arrow-color": "#ccc",
                "curve-style": "bezier",
                "target-arrow-shape": "triangle",
                "arrow-scale": 2,
            },
        },
        {
            selector: ".relation",
            style: {
                "background-color": "#ffffff",
                "label": "data(id)",
            },
        },
    ],
    layout: {
        name: "grid",
        rows: 1,
    },
})

// Put nodes from the last session back into the graph,
// and count the number of times each relation is referenced.
state.rules.forEach(rule => {
    if (rule.lastParsed !== null) {
        updateCytoElements(null, rule.lastParsed)
    }
})
// Lay out these added nodes
cyto.layout(layoutType).run()

console.log("Cytoscape instance: ", cyto)

//#endregion
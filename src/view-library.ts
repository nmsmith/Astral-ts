import { Ref, ref, isRef, pauseTracking, resumeTracking, ComputedRef, effect, ReactiveEffect, ReactiveEffectOptions, stop } from "@vue/reactivity"

// Styles for debug printing
const normalStyle = ""
const updateMsgStyle = "font-size: 120%; font-weight: bold; color: blue"
const elementStyle = "font-weight: bold"
const attributeStyle = "color: #7700ff"
const textContentStyle = "color: #007700"

/// Find the node with the given ID and replace it with the app's HTML.
/// Also organises clean-up code.
export function app(rootNodeID: string, appHTML: HTMLElement): void {
    const rootNode = document.getElementById(rootNodeID)
    if (rootNode === null) {
        console.error(`Unable to find app root node with ID: ${rootNodeID}`)
    }
    else {
        rootNode.replaceWith(appHTML)
    }
}

// Derived attributes and doc fragments (constructed via $-prefixed functions) are
// VIRTUAL DOM NODES that produce concrete HTML. They are considered to be owned
// by the view, must be cleaned up when they are removed from the view.
//
// Currently, there are two things to clean up: the effect() that maintains the 
// derived state (along with the corresponding effect in the parent which applies
// it to the DOM) and the entry in updateOrder which determines the order in which 
// the derived view state should be computed.
interface DerivedViewState<T = unknown> {
    $derived: true
    ref: Ref<T>
    effect: ReactiveEffect
}

type DerivedAttribute<T> = DerivedViewState<T>

type DerivedDocFragment = DerivedViewState<WithCleanupData<HTMLElement>[]>

function isDerivedViewState(value: unknown): value is DerivedViewState {
    return (value as DerivedViewState).$derived === true
}

// For attaching cleanup data to HTML elements
type WithCleanupData<E> = E & {
    // Effects that need to be disabled
    $ownEffects: ReactiveEffect[]
    // Derived attributes & doc fragments that need to be cleaned up (their effect & updateOrder)
    $derivedToClean: DerivedViewState[]
}

// ECMA Sets are iterated according to insertion order, and have sublinear insert/delete time.
// We insert nodes (elements or derived nodes) into this list in the order that they are created,
// since this reflects their natural dependencies. For example, an $if node dynamically creates
// a document fragment.
const updateOrder: Set<HTMLElement | DerivedViewState> = new Set()
// A map from a node to the effects that need to be run for it.
const domUpdateJobs: Map<HTMLElement | DerivedViewState, Set<ReactiveEffect>> = new Map()
console.log("Watch this for memory leaks: ", updateOrder)

function scheduleDOMUpdate(key: HTMLElement | DerivedViewState, update: () => void): ReactiveEffect {
    return effect(update, {scheduler: eff => {
        const existingSet = domUpdateJobs.get(key)
        if (existingSet === undefined) {
            const newSet = new Set() as Set<ReactiveEffect>
            domUpdateJobs.set(key, newSet.add(eff as ReactiveEffect))
        }
        else {
            existingSet.add(eff as ReactiveEffect)
        }
    }})
}

// A reactive attribute which is OWNED by the view.
// It will be destroyed if it is ever detached from the view tree.
export function $derived<T>(value: () => T): DerivedViewState<T> {
    const state: {$derived: true} = {
        $derived: true,
    }
    updateOrder.add(state as DerivedViewState)

    const result = ref(undefined) as Ref<T>
    const update = scheduleDOMUpdate(state as DerivedViewState, () => {
        console.log("%cDERIVED", elementStyle)
        result.value = value() as any
    })

    return Object.assign(state, {ref: result, effect: update})
}

// Every node that is permanently removed from the DOM must be cleaned up via this function
function cleanUp(node: WithCleanupData<HTMLElement>): void {
    // Double check this HTML element is one that we need to clean up
    if (node.$ownEffects === undefined) return
    // Remove this node from the list of registered nodes
    updateOrder.delete(node)
    // Destroy effects attached to the node
    node.$ownEffects.forEach(stop)
    // Clean up the derived view state attached to this node (attributes or children)
    node.$derivedToClean.forEach(derived => {
        updateOrder.delete(derived)
        stop(derived.effect)
    })
    // Clean up all children currently attached
    Array.from(node.children).forEach(node => cleanUp(node as WithCleanupData<HTMLElement>))
}

// A reactive subtree/attribute of the view, determined by a condition.
export function $if<T>(
    condition: () => boolean,
    branches: {_then: () => T, _else: () => T},
): DerivedViewState<T> {
    const _then = branches._then
    const _else = branches._else
    let conditionPrevious: boolean | undefined = undefined
    
    const state: {$derived: true} = {
        $derived: true,
    }
    updateOrder.add(state as DerivedViewState)

    const result = ref(undefined) as Ref<T>
    const update = scheduleDOMUpdate(state as DerivedViewState, () => {
        console.log("%cIF", elementStyle)
        const conditionNow = condition()
        if (conditionNow === true && conditionPrevious !== true) {
            console.log("  switched to first branch")
            pauseTracking()
            const oldValue = result.value
            if (Array.isArray(oldValue)) {
                (oldValue as WithCleanupData<HTMLElement>[]).forEach(cleanUp)
            }
            resumeTracking()
            result.value = _then() as any
        }
        else if (conditionNow === false && conditionPrevious !== false) {
            console.log("  switched to second branch")
            pauseTracking()
            const oldValue = result.value
            if (Array.isArray(oldValue)) {
                (oldValue as WithCleanupData<HTMLElement>[]).forEach(cleanUp)
            }
            resumeTracking()
            result.value = _else() as any
        }
        else {
            console.log("  no change")
        }
        conditionPrevious = conditionNow
    })

    return Object.assign(state, {ref: result, effect: update})
}

// A reactive subtree of the view, constructed from a list of data.
export function $for<T>(
    items: T[] | Ref<T[]>,
    f: (item: T, index: number) => HTMLElement[],
): DerivedDocFragment {
    const state: {$derived: true} = {
        $derived: true,
    }
    updateOrder.add(state as DerivedViewState)

    const result: Ref<WithCleanupData<HTMLElement>[]> = ref([])
    const update = isRef(items)
        ? scheduleDOMUpdate(state as DerivedViewState, () => {
            console.log(`%cFOR%c (${items.value.length} items)`, elementStyle, normalStyle)
            console.log("  all items changed (FIX ME)")
            // clean up old elements
            pauseTracking()
            ;(result.value as WithCleanupData<HTMLElement>[]).forEach(cleanUp)
            resumeTracking()
            // construct new elements
            const array: HTMLElement[] = []
            items.value.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            result.value = array as any
        })
        : scheduleDOMUpdate(state as DerivedViewState, () => {
            console.log(`%cFOR%c (${items.length} items)`, elementStyle, normalStyle)
            console.log("  all items changed (FIX ME)")
            // clean up old elements
            pauseTracking()
            ;(result.value as WithCleanupData<HTMLElement>[]).forEach(cleanUp)
            resumeTracking()
            // construct new elements
            const array: HTMLElement[] = []
            items.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            result.value = array as any
        })

    return Object.assign(state, {ref: result, effect: update})
}

// Update the DOM after executing the given state update function.
let updateNumber = 0
function thenUpdateDOM(eventName: string, stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        console.log(`%cDOM update ${++updateNumber} (event: ${eventName})`, updateMsgStyle)
        // Update the essential state
        stateUpdate(...args)
        // Update the DOM
        updateOrder.forEach(key => {
            const updatesForKey = domUpdateJobs.get(key)
            if (updatesForKey !== undefined) {
                updatesForKey.forEach(eff => {
                    if (eff.active) eff()
                })
            }
        })
        domUpdateJobs.clear()
    }
}

type SubRecordWithRefs<Keys extends keyof Element, Element> =
    { [K in Keys]: Element[K] | Ref<Element[K]> | DerivedAttribute<Element[K]> }

function prettifyClassName(name: string): string {
    if (name.length > 0) {
        return "." + name.replace(" ",".")
    }
    else {
        return name
    }
}

// Assign attribute values and attach listeners to re-assign observable values when they change
function assignReactiveAttributes<AssKeys extends keyof Element, Element extends HTMLElement>(
    el: WithCleanupData<Element>,
    assignment: SubRecordWithRefs<AssKeys, Element>,
): WithCleanupData<Element> {
    for (const key in assignment) {
        const attrValue: unknown | Ref<unknown> | DerivedAttribute<unknown> = assignment[key]
        // Update the attribute from a ref or a derived view state
        const scheduleAttributeUpdate = (attr: Ref<any>): ReactiveEffect =>
            scheduleDOMUpdate(el, () => {
                el[(key as AssKeys)] =  attr.value
                console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                console.log(`  %c${key} = "${attr.value}"`, attributeStyle)
            })
        if (isRef(attrValue)) {
            el.$ownEffects.push(scheduleAttributeUpdate(attrValue))
        }
        else if (isDerivedViewState(attrValue)) {
            el.$ownEffects.push(scheduleAttributeUpdate(attrValue.ref))
            el.$derivedToClean.push(attrValue)
        }
        else {
            el[(key as AssKeys)] = attrValue as any
        }
    }
    return el
}

export type HTMLChildren =
    (HTMLElement | DerivedViewState<HTMLElement[]>)[]

type HTMLChildrenWithCleanup =
    (WithCleanupData<HTMLElement> | DerivedDocFragment)[]

// TODO: Figure out how to properly move children around when the array changes.
function attachChildren(el: WithCleanupData<HTMLElement>, children: HTMLChildren): void {
    for (const child of children) {
        if (isDerivedViewState(child)) {
            const derivedDocFragment = child
            // Create a marker child so that when the ref is updated,
            // we know where we need to insert the new elements.
            const markerChild = document.createElement("div")
            markerChild.title = "group marker"
            markerChild.hidden = true
            el.appendChild(markerChild)
            // Stores children that are already in the DOM tree,
            // so that we can remove them when the ref is updated.
            const currentChildGroup: WithCleanupData<HTMLElement>[] = []
            // Update function for this derived view node.
            const updateChildren = scheduleDOMUpdate(el, () => {
                console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                for (const child of currentChildGroup) {
                    el.removeChild(child)
                    //cleanUp(child) We're now cleaning up in $if and $for
                    // Log the deletion of this child
                    console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                }
                currentChildGroup.length = 0
                // Create a sequence of nodes to add
                const newChildren = document.createDocumentFragment()
                for (const child of derivedDocFragment.ref.value) {
                    newChildren.appendChild(child as HTMLElement)
                    currentChildGroup.push(child as WithCleanupData<HTMLElement>)
                    // Log the addition of this child
                    console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                }
                // Add the nodes to the DOM
                el.insertBefore(newChildren, markerChild)
            })

            // When el is removed from the DOM, this is what needs cleaning up
            el.$ownEffects.push(updateChildren)
            el.$derivedToClean.push(derivedDocFragment)
        }
        // We have a non-reactive (static) element
        else {
            el.appendChild(child)  
        }
    }
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof Element, Element extends HTMLElement>(
    name: string,
    attributes: SubRecordWithRefs<Keys, Element>,
): WithCleanupData<Element> {
    const el = document.createElement(name) as WithCleanupData<Element>
    updateOrder.add(el)
    // Initialize cleanup data
    el.$ownEffects = []
    el.$derivedToClean = []
    // Ensures that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // TODO: Unsafe... we're presuming all keys starting with "on" have a value of function type
            attributes[key] = thenUpdateDOM(key, attributes[key] as any) as any
        }
    }
    return assignReactiveAttributes(el, attributes)
}

export function div<Keys extends keyof HTMLDivElement>(
    attributes: SubRecordWithRefs<Keys, HTMLDivElement>,
    children: HTMLChildren = [],
): HTMLDivElement {
    const el = element("div", attributes)
    attachChildren(el, children as HTMLChildren)
    return el
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: SubRecordWithRefs<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes)
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | Ref<string> | DerivedAttribute<string>,
    attributes: SubRecordWithRefs<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes)
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | Ref<string> | DerivedAttribute<string>,
    attributes: SubRecordWithRefs<Keys, HTMLButtonElement> = {} as any,
): HTMLButtonElement {
    Object.assign(attributes, {textContent: textContent})
    return element("button", attributes)
}

export function input<Keys extends keyof HTMLInputElement>(
    attributes: SubRecordWithRefs<Keys, HTMLInputElement> = {} as any,
): HTMLInputElement { 
    // Create the element
    const el = element("input", attributes)

    // If the "value" attribute exists and is a Ref, then set up two-way binding
    const attrsWithValue = attributes as SubRecordWithRefs<Keys | "value", HTMLInputElement>
    const valueRef: string | Ref<string> | DerivedAttribute<string> | undefined = attrsWithValue.value
    if (valueRef !== undefined && isRef(valueRef)) {
        const existingOnInput = el.oninput as
                  ((this: GlobalEventHandlers, ev: Event) => any) | null
            | Ref<((this: GlobalEventHandlers, ev: Event) => any) | null>
        // If there is no existing oninput function
        if (existingOnInput === null) {
            // On input, update "value" and then update the DOM
            el.oninput = thenUpdateDOM("oninput", function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
            }) as any
        }
        else {
            // On input, update "value" and then call the existing (pre-wrapped) oninput function
            el.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value

                if (typeof existingOnInput === "function") {
                    return existingOnInput.call(this, event)
                }
                else if (existingOnInput.value !== null) {
                    return existingOnInput.value.call(this, event)
                }
            }
        }
    }

    return el
}

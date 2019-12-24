import { Ref, isRef, isReactive, effect } from "@vue/reactivity"

// The below function can be used to construct a proposed sequence of child elements
// without physically constructing the DOM nodes. Instead, the sequence is
// keyed by the data that is used to construct each item, so that we can
// 

// interface LazyValue<K, V> {
//     key: K
//     value: () => V
// }

// declare global {
//     interface Array<T> {
//         computedMap<V>(f: (el: T, index: number) => V): LazyValue<T,V>[]
//     }
// }

// Array.prototype.computedMap = function<T, V>(
//     f: (el: T, index: number) => V
// ): LazyValue<T,V>[] {
//     return this.map( (el, index) => ({key: el, value: (): V => f(el, index)}) )
// // }

// declare global {
//     interface Array<T> {
//         computedMap<V>(f: (el: T, index: number) => V): (() => V)[]
//     }
// }

// Array.prototype.computedMap = function<T, V>(
//     f: (el: T, index: number) => V
// ): (() => V)[] {
//     return this.map( (el, index) => (): V => f(el, index) )
// }

const printDOMUpdates = true

function printDOMUpdate<T>(value: T): T {
    if (printDOMUpdates) {
        console.log("Updated DOM value to:")
        console.log(value)
    }
    return value
}

// Keep a queue of all the DOM updates that need to happen.
// TODO: Associate each update with some kind of key so that we don't
// run the same update several times.
const domUpdates: Function[] = []

function scheduleDOMUpdate(node: () => void): void {
    // Create an effect that (by default) runs immediately, and registers
    // any state that it accesses as a dependency.
    // By default, the effect will be re-executed every time the value of a
    // dependency changes. If a scheduler is provided, the effect will instead
    // invoke the scheduler whenever the value of a dependency changes. The
    // scheduler can then decide when/whether to run the effect.
    effect(node, {scheduler: job => {
        if (printDOMUpdates) console.log("Scheduling DOM update")
        domUpdates.push(job)
    }}) 
}

function scheduleDOMUpdateConditional(shouldSchedule: {value: boolean}, node: () => void): void {
    effect(node, {scheduler: job => {
        if (shouldSchedule.value) domUpdates.push(job)
    }}) 
}

// Update the DOM after executing the given state update function.
// Updating the DOM synchronously prevents any race condition where (e.g.)
// the user can click a button to alter some state that no longer exists.
function thenUpdateDOM(stateUpdate: Function): Function {
    return (...args: any[]): void => {
        stateUpdate(...args)
        domUpdates.forEach(f => f())
        domUpdates.length = 0
    }
}

type SubRecord<Keys extends keyof Element, Element> =
    { [K in Keys]: Element[K] }

type SubRecordWithRefs<Keys extends keyof Element, Element> =
    { [K in Keys]: Element[K] | Ref<Element[K]> }

// Type-safe assignment to EXISTING properties of the given object
function assignProps<AssKeys extends keyof T, T>(
    object: T,
    assignment: SubRecord<AssKeys, T>,
): void {
    for (const key in assignment) {
        object[key] = assignment[key]
    }
}

// Assign props and attach listeners to re-assign props whose values are refs
function assignPropsWithListeners<AssKeys extends keyof T, T>(
    object: T,
    assignment: SubRecordWithRefs<AssKeys, T>,
): void {
    for (const key in assignment) {
        if (isRef(assignment[key])) {
            scheduleDOMUpdate(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                object[(key as AssKeys)] = printDOMUpdate((assignment[key] as any).value)
            })
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            object[(key as AssKeys)] = (assignment[key] as any)
        }
    }
}

// Ensures that DOM events trigger DOM updates after running
export function wrapEventHandlers<Keys extends keyof Element, Element extends HTMLElement>(
    attributes: SubRecordWithRefs<Keys, Element>
): void {
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // Unsafe: we're presuming all keys starting with "on" have a value of function type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            attributes[key] = thenUpdateDOM(attributes[key] as any) as any
        }
    }
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof Element, Element extends HTMLElement>(
    name: string,
    attributes: SubRecordWithRefs<Keys, Element>,
): Element {
    const el = document.createElement(name) as Element
    wrapEventHandlers(attributes)
    assignPropsWithListeners(el, attributes)
    return el
}

type HTMLChildren =
    (HTMLElement | Ref<HTMLElement[]>)[] // | ComputedElements[] | Ref<ComputedElements[]>)[]

// TODO: Figure out how to properly move children around when the array changes.
// TODO: Create a non-reactive (static) version of each of the DOM node constructors?
function attachChildren(el: HTMLElement, children: HTMLChildren): void {
    for (const childGroup of children) {
        if (isRef(childGroup)) {
            // Create a marker child so that when the ref is updated,
            // we know where we need to insert the new elements.
            const markerChild = document.createElement("div")
            markerChild.title = "group marker"
            markerChild.hidden = true
            el.appendChild(markerChild)
            // Stores children that are already in the DOM tree,
            // so that we can remove them when the ref is updated.
            const existingChildren: HTMLElement[] = []
            scheduleDOMUpdate(() => {
                printDOMUpdate("Children replaced")
                for (const child of existingChildren) {
                    el.removeChild(child)
                }
                existingChildren.length = 0
                // Create a sequence of nodes to add
                const newChildren = document.createDocumentFragment()
                for (const child of childGroup.value) {
                    newChildren.appendChild(child as HTMLElement)
                    existingChildren.push(child as HTMLElement)
                }
                // Add the nodes to the DOM
                el.insertBefore(newChildren, markerChild)
            })
        }
        // We have a non-reactive (static) element
        else {
            el.appendChild(childGroup)
        }
    }
}

export type ComputedElements = () => HTMLElement[]

export function div<Keys extends keyof HTMLDivElement>(
    attributes: SubRecordWithRefs<Keys, HTMLDivElement>,
    children: HTMLChildren,
): HTMLDivElement {
    const el = element("div", attributes)
    attachChildren(el, children)
    return el
}

export function box<Keys extends keyof HTMLDivElement>(
    attributes: SubRecordWithRefs<Keys, HTMLDivElement>,
): HTMLDivElement {
    return element("div", attributes)
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: SubRecordWithRefs<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes)
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | Ref<string>,
    attributes: SubRecordWithRefs<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes)
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | Ref<string>,
    attributes: SubRecordWithRefs<Keys, HTMLButtonElement> = {} as any,
): HTMLButtonElement {
    Object.assign(attributes, {textContent: textContent})
    return element("button", attributes)
}

export function input<Keys extends keyof HTMLInputElement>(
    attributes: SubRecordWithRefs<Keys, HTMLInputElement> = {} as any,
): HTMLInputElement { 
    // Don't call the element() function; we need something more custom
    const el = document.createElement("input") as HTMLInputElement

    const attrsWithValue =
        attributes as SubRecordWithRefs<Keys | "value", HTMLInputElement>
    const valueRef: string | Ref<string> | undefined =
        attrsWithValue.value
    // If the "value" attribute exists and is a Ref, then set up two-way binding.
    if (valueRef !== undefined && typeof valueRef !== "string") {
        // Can switch off DOM update when the input is mutating its own binding
        const mutateThisInput = {value: true}
        // Set up watcher
        scheduleDOMUpdateConditional(mutateThisInput, () => {
            el.value = printDOMUpdate(valueRef.value)
        })
        // Remove "value" from list of attributes so it doesn't get assigned later
        delete (attrsWithValue as any).value
        // Update the "value" attribute whenever the input is changed
        const attributesIncludingOnInput =
            attributes as SubRecordWithRefs<Keys | "oninput", HTMLInputElement>
        const oninput = attributesIncludingOnInput.oninput
        assignProps(attributesIncludingOnInput, {oninput: function (event: Event) {
            mutateThisInput.value = false
            valueRef.value = (event.target as HTMLInputElement).value
            mutateThisInput.value = true
            // Call the original oninput attribute that was provided (if any)
            if (oninput !== undefined && oninput !== null) {
                if (typeof oninput === "function") {
                    oninput.call(this, event)
                }
                else if (oninput.value !== null) {
                    oninput.value.call(this, event)
                }
            }
        }})
    }

    wrapEventHandlers(attributes)
    assignPropsWithListeners(el, attributes)
    return el
}

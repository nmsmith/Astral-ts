import { Ref, ComputedRef, isRef, effect, ReactiveEffect, stop } from "@vue/reactivity"

// Styles for debug printing
const updateMsgStyle = "font-size: 110%; font-weight: bold; color: blue; padding-top: 12px"
const elementStyle = "font-weight: bold"
const attributeChangedStyle = "color: #7700ff"
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

// The domUpdateJobs Map associates HTML Elements with the effects that need to run
// to keep them updated.
//
// ECMA Maps are iterated according to insertion order, and have sublinear insert time.
// We insert HTML Elements into the Map in the order that they are created, as this offers
// an optimal update order (top-down). Nodes that are part of a derived doc fragment are
// ALWAYS created after the parent they will attach to. Elements MUST be removed from
// this map when they are deleted to avoid a memory leak. A WeakMap cannot be used since
// it does not support iteration.
const domUpdateJobs: Map<HTMLElement, Set<ReactiveEffect>> = new Map()
console.log("Watch this for memory leaks: ", domUpdateJobs)

type Effectful<E> = E & {
    // Effects that need to be disabled
    $effects: ReactiveEffect[]
}

function scheduleDOMUpdate(el: Effectful<HTMLElement>, update: () => void): void {
    el.$effects.push(effect(update, {scheduler: eff => {
        const jobsForThisEl = domUpdateJobs.get(el)
        if (jobsForThisEl === undefined) {
            console.error("Job map entry missing for HTML element: ", el)
        }
        else {
            jobsForThisEl.add(eff as ReactiveEffect)
        }
    }}))
}

// Derived attributes and doc fragments (constructed via $-prefixed functions) are
// VIRTUAL DOM NODES that produce concrete HTML. They are attached to a concrete
// DOM node. They cannot be directly nested.

interface Derived<T> {
    $derived: "derived"
    value: () => T
}
interface DerivedFromChoice<T> {
    $derived: "if"
    condition: () => boolean
    branches: {_then: () => T, _else: () => T}
}

export type WithIndex<T extends object> = T & {$index: number}

interface DerivedFromSequence<T, I extends object> {
    $derived: "for"
    items: I[] | ComputedRef<I[]> // must be "ComputedRef" instead of "Ref" or TypeScript gets confused
    f: (item: WithIndex<I>) => T
}

export type DerivedAttribute<T> = Derived<T> | DerivedFromChoice<T>

export type DerivedDocFragment<I extends object> =
      DerivedFromChoice<HTMLElement[]>
    | DerivedFromSequence<HTMLElement[], I>

function isDerived(value: unknown): value is Derived<unknown> {
    return (value as Derived<unknown>).$derived === "derived"
}

function isDerivedFromChoice(value: unknown): value is DerivedFromChoice<unknown> {
    return (value as DerivedFromChoice<unknown>).$derived === "if"
}

function isDerivedFromSequence(value: unknown): value is DerivedFromSequence<unknown, any> {
    return (value as DerivedFromSequence<unknown, any>).$derived === "for"
}

// Behaves identically to computed(), but is automatically cleaned up,
// and has different performance characteristics.
export function $derived<T>(value: () => T): Derived<T> {
    return {$derived: "derived", value: value}
}

export function $if<T>(
    condition: () => boolean,
    branches: {_then: () => T, _else: () => T},
): DerivedFromChoice<T> {
    return {$derived: "if", condition: condition, branches: branches}
}

/**
 * WARNING: The elements of the array MUST be unique object references.
 * The DOM update code hashes the elements by their identity in order to
 * determine which elements have changed when the array is updated.
 */
export function $for<I extends object>(
    items: I[] | ComputedRef<I[]>,
    f: (item: WithIndex<I>) => HTMLElement[],
): DerivedFromSequence<HTMLElement[], I> {
    return {$derived: "for", items: items, f: f}
}

// Every node that is permanently removed from the DOM must be cleaned up via this function
function cleanUp(node: Effectful<HTMLElement>): void {
    // Double check this HTML element is one that we need to clean up
    if (node.$effects === undefined) return

    // If the node is reactive, clean it up
    if (node.$effects.length > 0) {
        domUpdateJobs.delete(node)
        node.$effects.forEach(stop)
    }

    // Clean up all children currently attached
    Array.from(node.children).forEach(node => cleanUp(node as Effectful<HTMLElement>))
}

// Update the DOM after executing the given state update function.
let updateNumber = 0
function thenUpdateDOM(eventName: string, stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        console.log(`%cDOM update ${++updateNumber} (event: ${eventName})`, updateMsgStyle)
        // Update the essential state
        stateUpdate(...args)
        // Update the DOM
        domUpdateJobs.forEach(jobSet => {
            jobSet.forEach(eff => {
                if (eff.active) eff()
            })
            jobSet.clear()
        })
    }
}

// I may want to flesh out this list of event handlers eventually.
// Currently, I just need to ensure oninput is a plain old function
// so that I can hijack it for two-way binding.
type EventHandler = "oninput"

// Defines a record of properties that can be assigned to El.
// If the property is an EventHandler, then it must be a function.
// Otherwise, the property can be dynamically computed via Ref etc...
export type SubRecordWithRefs<Keys extends keyof El, El> =
    { [K in Keys]: K extends EventHandler ? El[K] : (El[K] | Ref<El[K]> | DerivedAttribute<El[K]>) }

function prettifyClassName(name: string): string {
    if (name.length > 0) {
        return "." + name.replace(" ",".")
    }
    else {
        return name
    }
}

function logChangeStart(el: HTMLElement): void {
    console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
}

// Assign attribute values and attach listeners to re-assign observable values when they change
function assignReactiveAttributes<AssKeys extends keyof El, El extends HTMLElement>(
    el: Effectful<El>,
    assignment: SubRecordWithRefs<AssKeys, El>,
): Effectful<El> {
    function logAttributeChange(key: string, value: unknown): void {
        logChangeStart(el)
        console.log(`  %c${key} = "${value}"`, attributeChangedStyle)
    }
    for (const key in assignment) {
        const attrValue: unknown | Ref<unknown> | DerivedAttribute<unknown> = assignment[key]
            
        if (isRef(attrValue)) {
            scheduleDOMUpdate(el, () => {
                el[(key as AssKeys)] = attrValue.value
                logAttributeChange(key, attrValue.value)
            })
        }
        else if (isDerived(attrValue)) {
            scheduleDOMUpdate(el, () => {
                const newValue = attrValue.value()
                el[(key as AssKeys)] = newValue as any
                logAttributeChange(key, newValue)
            })
        }
        else if (isDerivedFromChoice(attrValue)) {
            const condition = attrValue.condition
            const _then = attrValue.branches._then
            const _else = attrValue.branches._else
            let conditionPrevious: boolean | undefined = undefined
            
            scheduleDOMUpdate(el, () => {
                const conditionNow = condition()
                if (conditionNow === true && conditionPrevious !== true) {
                    const newValue = _then()
                    el[(key as AssKeys)] = newValue as any
                    logAttributeChange(key, newValue)
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    const newValue = _else()
                    el[(key as AssKeys)] = newValue as any
                    logAttributeChange(key, newValue)
                }

                conditionPrevious = conditionNow
            })
        }
        else {
            el[(key as AssKeys)] = attrValue as any
        }
    }
    return el
}

export type HTMLChildren =
    (HTMLElement | DerivedDocFragment<any>)[]

function attachChildren(el: Effectful<HTMLElement>, children: HTMLChildren): void {
    function putFragmentMarker(): Element {
        // Create a marker child so that when the $if or $for fragment
        // is updated, we know where we need to insert the new elements.
        const markerChild = document.createElement("div")
        markerChild.title = "group marker"
        markerChild.hidden = true
        el.appendChild(markerChild)
        return markerChild
    }
    function logAdd(child: Effectful<HTMLElement>): void {
        console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
    }
    function logRemove(child: Effectful<HTMLElement>): void {
        console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
    }
    function remove(child: Effectful<HTMLElement>): void {
        el.removeChild(child)
        cleanUp(child)
        logRemove(child)
    }

    children.forEach(child => {
        if (isDerivedFromChoice(child)) {
            const marker = putFragmentMarker()
            let childrenAttachedHere: Effectful<HTMLElement>[] = []

            const condition = child.condition
            const _then = child.branches._then
            const _else = child.branches._else
            let conditionPrevious: boolean | undefined = undefined
        
            scheduleDOMUpdate(el, () => {  
                const conditionNow = condition()
                if (conditionNow === true && conditionPrevious !== true) {
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    // add
                    childrenAttachedHere = _then() as Effectful<HTMLElement>[]
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => {
                        el.insertBefore(child, marker) 
                        logAdd(child)
                    })
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    // add
                    childrenAttachedHere = _else() as Effectful<HTMLElement>[]
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => {
                        el.insertBefore(child, marker) 
                        logAdd(child)
                    })
                }
                conditionPrevious = conditionNow
            })
        }
        else if (isDerivedFromSequence(child)) {
            const marker = putFragmentMarker()
            let elementsCache: Map<unknown, Effectful<HTMLElement>[]> = new Map()

            const itemsOrRef = (child as DerivedFromSequence<Effectful<HTMLElement>[], object>).items
            const f = (child as DerivedFromSequence<Effectful<HTMLElement>[], object>).f

            // Temp benchmarking
            const childrenAttachedHere: Effectful<HTMLElement>[] = []

            scheduleDOMUpdate(el, () => {
                const fragment = document.createDocumentFragment()
                const items = isRef(itemsOrRef) ? itemsOrRef.value : itemsOrRef

                const createAllNewChildren = false
                if (createAllNewChildren) { // FOR BENCHMARKING ONLY
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    childrenAttachedHere.length = 0
                    // add
                    items.forEach((item, index) => {
                        const itemWithIndex = item as WithIndex<object>
                        itemWithIndex.$index = index
                        childrenAttachedHere.push(...f(itemWithIndex))
                    })
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => fragment.appendChild(child))
                    el.insertBefore(fragment, marker)
                }
                else {
                    const newElementsCache: Map<unknown, Effectful<HTMLElement>[]> = new Map()
                    const newElementsForLogging: Effectful<HTMLElement>[] = []
                    // For each item, determine whether new or already existed
                    items.forEach((item, index) => {
                        const existingElements = elementsCache.get(item)
                        if (existingElements === undefined) {
                            // Associate the item with a reactive index (it may be moved later)
                            const itemWithIndex = item as WithIndex<object>
                            itemWithIndex.$index = index
                            // Item is new; create and cache its DOM elements
                            const newElements = f(itemWithIndex)
                            fragment.append(...newElements)
                            newElementsCache.set(item, newElements)
                            newElementsForLogging.push(...newElements)
                        }
                        else {
                            // Update the item's index
                            (item as WithIndex<object>).$index = index
                            // Item is old; use its existing elements
                            fragment.append(...existingElements)
                            elementsCache.delete(item)
                            newElementsCache.set(item, existingElements)
                        }
                    })

                    // Log each new item that was added
                    if (newElementsForLogging.length > 0) {
                        logChangeStart(el)
                        newElementsForLogging.forEach(logAdd)
                    }

                    // Remove the elements for the items which were removed
                    if (elementsCache.size > 0) {
                        logChangeStart(el)
                        elementsCache.forEach(oldElements => {
                            oldElements.forEach(remove)
                        })
                    }

                    // Attach the new nodes
                    el.insertBefore(fragment, marker)
                    elementsCache = newElementsCache
                }
            })
        }
        // We have a non-reactive (static) child
        else {
            el.appendChild(child)  
        }
    })
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof El, El extends HTMLElement>(
    name: string,
    attributes: SubRecordWithRefs<Keys, El>,
    children: HTMLChildren,
): Effectful<El> {
    const el = document.createElement(name) as Effectful<El>
    el.$effects = []
    domUpdateJobs.set(el, new Set())

    // Ensure that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // Technically unsafe... we're presuming all keys starting with "on" have a value
            // of function type. I checked all the types in lib.dom.d.ts and it seems safe.
            attributes[key] = thenUpdateDOM(key, attributes[key] as any) as any
        }
    }
    // Finish constructing the element
    assignReactiveAttributes(el, attributes)
    attachChildren(el, children)

    // If the element is not reactive, remove it from the list of elements that can update.
    // We needed to insert it immediately after creation to give it update priority.
    if (el.$effects.length === 0) {
        domUpdateJobs.delete(el)
    }
    return el
}

export function div<Keys extends keyof HTMLDivElement>(
    attributes: SubRecordWithRefs<Keys, HTMLDivElement>,
    children: HTMLChildren = [],
): HTMLDivElement {
    return element("div", attributes, children)
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: SubRecordWithRefs<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes, [])
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | Ref<string> | DerivedAttribute<string>,
    attributes: SubRecordWithRefs<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes, [])
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | Ref<string> | DerivedAttribute<string>,
    attributes: SubRecordWithRefs<Keys, HTMLButtonElement> = {} as any,
): HTMLButtonElement {
    Object.assign(attributes, {textContent: textContent})
    return element("button", attributes, [])
}

export function input<Keys extends keyof HTMLInputElement>(
    attributes: SubRecordWithRefs<Keys, HTMLInputElement> = {} as any,
): HTMLInputElement { 
    const attrs = attributes as SubRecordWithRefs<Keys | "value" | "oninput", HTMLInputElement>
    const valueRef: string | Ref<string> | DerivedAttribute<string> | undefined = attrs.value
    // If the "value" attribute exists and is a Ref, then set up two-way binding
    if (valueRef !== undefined && isRef(valueRef)) {
        const existingOnInput = attrs.oninput
        // If there is no existing oninput function
        if (existingOnInput === undefined || existingOnInput === null) {
            // On input, update the ref bound to "value"
            attrs.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
            }
        }
        else {
            // On input, update the ref bound to "value" and then call the existing oninput function
            attrs.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
                return existingOnInput.call(this, event)
            }
        }
    }

    return element("input", attributes, [])
}

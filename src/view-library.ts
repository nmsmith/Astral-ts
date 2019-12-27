import { Ref, isRef, effect, ReactiveEffect, stop } from "@vue/reactivity"

// Styles for debug printing
const normalStyle = ""
const updateMsgStyle = "font-size: 120%; font-weight: bold; color: blue"
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

interface DerivedFromSequence<T, I = unknown> {
    $derived: "for"
    items: I[] | Ref<I[]>
    f: (item: I, index: number) => T
}

export type DerivedAttribute<T> = Derived<T> | DerivedFromChoice<T>

export type DerivedDocFragment<I> =
      DerivedFromChoice<HTMLElement[]>
    | DerivedFromSequence<HTMLElement[], I>

function isDerived(value: unknown): value is Derived<unknown> {
    return (value as Derived<unknown>).$derived === "derived"
}

function isDerivedFromChoice(value: unknown): value is DerivedFromChoice<unknown> {
    return (value as DerivedFromChoice<unknown>).$derived === "if"
}

function isDerivedFromSequence(value: unknown): value is DerivedFromSequence<unknown> {
    return (value as DerivedFromSequence<unknown>).$derived === "for"
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

export function $for<I>(
    items: I[] | Ref<I[]>,
    f: (item: I, index: number) => HTMLElement[],
): DerivedDocFragment<I> {
    return {$derived: "for", items: items, f: f}
}

// Every node that is permanently removed from the DOM must be cleaned up via this function
function cleanUp(node: Effectful<HTMLElement>): void {
    // Double check this HTML element is one that we need to clean up
    if (node.$effects === undefined) return
    // Remove this node from the list of registered nodes
    domUpdateJobs.delete(node)
    // Destroy effects attached to the node
    node.$effects.forEach(stop)
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

function logChangeStart(el: HTMLElement): void {
    console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
}

// Assign attribute values and attach listeners to re-assign observable values when they change
function assignReactiveAttributes<AssKeys extends keyof Element, Element extends HTMLElement>(
    el: Effectful<Element>,
    assignment: SubRecordWithRefs<AssKeys, Element>,
): Effectful<Element> {
    function logNoChangeIf(key: string): void {
        logChangeStart(el)
        console.log(`  no change to %c${key}%c via %c$if%c construct`, attributeChangedStyle, normalStyle, elementStyle, normalStyle)
    }
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
                else logNoChangeIf(key)

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

// TODO: Figure out how to properly move children around when the array changes.
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
    function logNoChangeIf(): void {
        logChangeStart(el)
        console.log("  no change to children via %c$if%c construct", elementStyle, normalStyle)
    }
    function add(child: Effectful<HTMLElement>, before: Element): void {
        el.insertBefore(child, before)
        // Log the addition of this child
        console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
    }
    function remove(child: Effectful<HTMLElement>): void {
        el.removeChild(child)
        cleanUp(child)
        // Log the deletion of this child
        console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
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
                    logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    childrenAttachedHere = _then() as Effectful<HTMLElement>[]
                    logChangeStart(el)
                    childrenAttachedHere.forEach(child => add(child, marker))
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    childrenAttachedHere = _else() as Effectful<HTMLElement>[]
                    logChangeStart(el)
                    childrenAttachedHere.forEach(child => add(child, marker))
                }
                else logNoChangeIf()
                conditionPrevious = conditionNow
            })
        }
        else if (isDerivedFromSequence(child)) {
            const marker = putFragmentMarker()
            const childrenAttachedHere: Effectful<HTMLElement>[] = []

            const itemsOrRef = (child as DerivedFromSequence<Effectful<HTMLElement>[]>).items
            const f = (child as DerivedFromSequence<Effectful<HTMLElement>[]>).f

            scheduleDOMUpdate(el, () => {   
                const items = isRef(itemsOrRef) ? itemsOrRef.value : itemsOrRef
                logChangeStart(el)
                childrenAttachedHere.forEach(remove)
                childrenAttachedHere.length = 0
                items.forEach((item, index) => childrenAttachedHere.push(...f(item, index)))
                logChangeStart(el)
                console.log(`  all ${items.length} items changed (FIX ME)`)
                childrenAttachedHere.forEach(child => add(child, marker))
            })
        }
        // We have a non-reactive (static) child
        else {
            el.appendChild(child)  
        }
    })
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof Element, Element extends HTMLElement>(
    name: string,
    attributes: SubRecordWithRefs<Keys, Element>,
    children: HTMLChildren,
): Effectful<Element> {
    const el = document.createElement(name) as Effectful<Element>
    el.$effects = []

    // Ensure that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // TODO: Unsafe... we're presuming all keys starting with "on" have a value of function type
            attributes[key] = thenUpdateDOM(key, attributes[key] as any) as any
        }
    }
    // Finish constructing the element
    assignReactiveAttributes(el, attributes)
    attachChildren(el, children)

    // If the element is reactive, add it to the list of elements that can udpate
    if (el.$effects.length > 0) {
        domUpdateJobs.set(el, new Set())
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
    // Create the element
    const el = element("input", attributes, [])

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

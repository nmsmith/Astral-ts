import { Ref, ComputedRef, isRef, computed, effect, ReactiveEffect, stop, ReactiveEffectOptions } from "@vue/reactivity"
import { computedIf, computedFor } from "./reactivity-extra"

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

// DerivedViewState (constructed via $-prefixed functions) is considered owned by
// the DOM tree, so it will be cleaned up automatically as the tree is mutated.
interface DerivedViewState<T> extends ComputedRef<T> {
    isDVS: true
}

function markAsDVS<T>(ref: Ref<T>): DerivedViewState<T> {
    const dvsRef = ref as DerivedViewState<T>
    dvsRef.isDVS = true
    return dvsRef
}

function isDVS(value: any): value is DerivedViewState<any> {
    return (value as DerivedViewState<any>).isDVS === true
}

export function $derived<T>(value: () => T): DerivedViewState<T> {
    return markAsDVS(computed(value))
}

export function $if<T>(
    condition: () => boolean,
    branches: {_then: () => T, _else: () => T},
): DerivedViewState<T> {
    return markAsDVS(computedIf(condition, branches))
}

export function $for<T, R>(
    items: T[] | Ref<T[]>,
    f: (item: T, index: number) => R[],
): DerivedViewState<R[]> {
    return markAsDVS(computedFor(items, f))
}

// Keep a set of all the DOM updates that need to happen.
// Being a set, duplicate requests are ignored.
const domUpdates: Set<Function> = new Set()

const domUpdateScheduler: ReactiveEffectOptions =
    { scheduler: job => domUpdates.add(job) }

function scheduleDOMUpdate(el: HTMLElement, update: () => void): ReactiveEffect<void> {
    // Create an effect that (by default) runs immediately, and registers
    // any state that it accesses as a dependency.
    // By default, the effect will be re-executed every time the value of a
    // dependency changes. If a scheduler is provided, the effect will instead
    // invoke the scheduler whenever the value of a dependency changes. The
    // scheduler can then decide when/whether to run the effect.
    return effect(() => {
        // Don't update the node if it has just been deleted
        if ((el as WithEffects<HTMLElement>).$effects !== undefined) {
            update()
        }
    }, domUpdateScheduler) 
}

// Update the DOM after executing the given state update function.
// Updating the DOM synchronously prevents any race condition where (e.g.)
// the user can click a button to alter some state that no longer exists.
function thenUpdateDOM(stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        stateUpdate(...args)
        domUpdates.forEach(f => f())
        domUpdates.clear()
    }
}

type WithEffects<E> = E & { $effects: ReactiveEffect<void>[] }

type SubRecord<Keys extends keyof Element, Element> =
    { [K in Keys]: Element[K] }

type ValueOrRef<T> = T | Ref<T> | DerivedViewState<T>

type SubRecordWithRefs<Keys extends keyof Element, Element> =
    { [K in Keys]: ValueOrRef<Element[K]> }

// Type-safe assignment to EXISTING properties of the given object
function assignProps<AssKeys extends keyof T, T>(
    object: T,
    assignment: SubRecord<AssKeys, T>,
): void {
    for (const key in assignment) {
        object[key] = assignment[key]
    }
}

// Ensures that DOM events trigger DOM updates after running
function wrapEventHandlers<Keys extends keyof Element, Element extends HTMLElement>(
    attributes: SubRecordWithRefs<Keys, Element>
): void {
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // TODO: Unsafe... we're presuming all keys starting with "on" have a value of function type
            attributes[key] = thenUpdateDOM(attributes[key] as any) as any
        }
    }
}

function prettifyClassName(name: string): string {
    if (name.length > 0) {
        return "." + name.replace(" ",".")
    }
    else {
        return name
    }
}

const elementStyle = "font-weight: bold"
const attributeStyle = "color: #7700ff"
const textContentStyle = "color: #007700"

// Assign props and attach listeners to re-assign props whose values are refs
function assignReactiveAttributes<AssKeys extends keyof Element, Element extends HTMLElement>(
    el_: Element,
    assignment: SubRecordWithRefs<AssKeys, Element>,
): WithEffects<Element> {
    // Create the array to store the effects that maintain the derived view state
    const el = el_ as WithEffects<Element>
    el.$effects = []
    for (const key in assignment) {
        const attrValue: ValueOrRef<any> = assignment[key]
        if (isRef(attrValue)) {
            el.$effects.push(scheduleDOMUpdate(el, () => {
                el[(key as AssKeys)] =  attrValue.value
                console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                console.log(`  %c${key} = "${attrValue.value}"`, attributeStyle)
            }))
            // If the attribute value is derived view state, store the effect
            // so that we can clean it up later.
            if (isDVS(attrValue)) {
                el.$effects.push(attrValue.effect)
            }
        }
        else {
            el[(key as AssKeys)] = attrValue
        }
    }
    return el
}

type HTMLChildren =
    (HTMLElement | DerivedViewState<HTMLElement[]>)[]

// TODO: Figure out how to properly move children around when the array changes.
function attachChildren(el: WithEffects<HTMLElement>, children: HTMLChildren): void {
    for (const childGroup of children) {
        if (isDVS(childGroup)) {
            // Create a marker child so that when the ref is updated,
            // we know where we need to insert the new elements.
            const markerChild = document.createElement("div")
            markerChild.title = "group marker"
            markerChild.hidden = true
            el.appendChild(markerChild)
            // Stores children that are already in the DOM tree,
            // so that we can remove them when the ref is updated.
            const existingChildren: HTMLElement[] = []
            // Store the effect for this derived view state so we can clean it up if/when
            // this element is removed from the DOM tree. Store the DOM update effect too.
            el.$effects.push(childGroup.effect,
                scheduleDOMUpdate(el, () => {
                    console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                    for (const child of existingChildren) {
                        el.removeChild(child)
                        // We're removing the child, so destroy the child's own effects
                        const effects = (child as WithEffects<HTMLElement>).$effects
                        if (effects !== undefined && effects.length > 0) {    
                            effects.forEach(stop)
                            ;(child as any).$effects = undefined
                        }
                        console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                    }
                    existingChildren.length = 0
                    // Create a sequence of nodes to add
                    const newChildren = document.createDocumentFragment()
                    for (const child of childGroup.value) {
                        newChildren.appendChild(child as HTMLElement)
                        existingChildren.push(child as HTMLElement)
                        console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                    }
                    // Add the nodes to the DOM
                    el.insertBefore(newChildren, markerChild)
                })
            )
        }
        // We have a non-reactive (static) element
        else {
            el.appendChild(childGroup)
        }
    }
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof Element, Element extends HTMLElement>(
    name: string,
    attributes: SubRecordWithRefs<Keys, Element>,
): WithEffects<Element> {
    const el = document.createElement(name) as Element
    wrapEventHandlers(attributes)
    return assignReactiveAttributes(el, attributes)
}

export function div<Keys extends keyof HTMLDivElement>(
    attributes: SubRecordWithRefs<Keys, HTMLDivElement>,
    children: HTMLChildren = [],
): HTMLDivElement {
    const el = element("div", attributes)
    attachChildren(el, children)
    return el
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
    // Create the element
    const el = element("input", attributes)

    // If the "value" attribute exists and is a Ref, then set up two-way binding
    const attrsWithValue = attributes as SubRecordWithRefs<Keys | "value", HTMLInputElement>
    const valueRef: string | Ref<string> | undefined = attrsWithValue.value
    if (valueRef !== undefined && typeof valueRef !== "string") {
        const existingOnInput = el.oninput as
                  ((this: GlobalEventHandlers, ev: Event) => any) | null
            | Ref<((this: GlobalEventHandlers, ev: Event) => any) | null>
        // If there is no existing oninput function
        if (existingOnInput === null) {
            // On input, update "value" and then update the DOM
            el.oninput = thenUpdateDOM(function (event: Event): any {
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

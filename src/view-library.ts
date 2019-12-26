import { Ref, ref, isRef, ComputedRef, effect, ReactiveEffect, ReactiveEffectOptions, stop } from "@vue/reactivity"

// Styles for debug printing
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

// Derived view state (constructed via $-prefixed functions) is considered
// owned by the view, and the code in this module is responsible for cleaning
// it up when it is removed from the view.
// Currently, there are two things to clean up: the effect() that maintains the 
// derived state (along with the corresponding effect which applies it to the DOM)
// and the entry in derivedSubtreeConstructionOrder which determines the order
// in which the derived view state should be computed (top-down order).
interface DerivedViewState<T> {
    $derived: true
    ref: ComputedRef<T>
}

function isDerivedViewState(value: any): value is DerivedViewState<any> {
    return (value as DerivedViewState<any>).$derived === true
}

// ECMA Sets are iterated according to insertion order, and have sublinear insert/delete time.
// All derived subtrees should be constructed (and registered) parent-first,
// which is an optimal order to run the update jobs in.
const derivedSubtreeConstructionOrder: Set<Ref<any>> = new Set()
// A map from the derived view state to its (potential) update function,
// for each piece of view state that needs to be updated.
const derivedViewStateUpdateJobs: Map<Ref<any>, Function> = new Map()
console.log("Watch this for memory leaks: ", derivedSubtreeConstructionOrder)

function dvsUpdateScheduler(ref: Ref<any>): (job: Function) => void {
    return (job: Function): void => { derivedViewStateUpdateJobs.set(ref, job) }
}

// A reactive attribute which is OWNED by the view.
// It will be destroyed if it is ever detached from the view tree.
export function $derived<T>(value: () => T): DerivedViewState<T> {
    const result: Ref<T | undefined> = ref(undefined)
    derivedSubtreeConstructionOrder.add(result as Ref<T>)

    ;(result as any).effect = effect(() => {
        console.log("%cDERIVED", elementStyle)
        result.value = value() as any
    }, {scheduler: dvsUpdateScheduler(result as Ref<T>)})

    return {$derived: true, ref: result as ComputedRef<T>}
}

// A reactive subtree/attribute of the view, determined by a condition.
export function $if<T>(
    condition: () => boolean,
    branches: {_then: () => T, _else: () => T},
): DerivedViewState<T> {
    const _then = branches._then
    const _else = branches._else
    let conditionPrevious: boolean | undefined = undefined
    
    const result: Ref<T | undefined> = ref(undefined)
    derivedSubtreeConstructionOrder.add(result as Ref<T>)

    ;(result as any).effect = effect(() => {
        console.log("%cIF", elementStyle)
        const conditionNow = condition()
        if (conditionNow === true && conditionPrevious !== true) {
            console.log("  switched to first branch")
            result.value = _then() as any
        }
        else if (conditionNow === false && conditionPrevious !== false) {
            console.log("  switched to second branch")
            result.value = _else() as any
        }
        else {
            console.log("  no change")
        }
        conditionPrevious = conditionNow
    }, {scheduler: dvsUpdateScheduler(result as Ref<T>)})

    return {$derived: true, ref: result as ComputedRef<T>}
}

// A reactive subtree of the view, constructed from a list of data.
export function $for<T>(
    items: T[] | Ref<T[]>,
    f: (item: T, index: number) => HTMLElement[],
): DerivedViewState<HTMLElement[]> {
    const result: Ref<HTMLElement[] | undefined> = ref(undefined)
    derivedSubtreeConstructionOrder.add(result as Ref<HTMLElement[]>)

    ;(result as any).effect = isRef(items)
        ? effect(() => {
            console.log("%cFOR", elementStyle)
            console.log("  all items changed (FIX ME)")
            const array: HTMLElement[] = []
            items.value.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            result.value = array
        }, {scheduler: dvsUpdateScheduler(result as Ref<HTMLElement[]>)})
        : effect(() => {
            console.log("%cFOR", elementStyle)
            console.log("  all items changed (FIX ME)")
            const array: HTMLElement[] = []
            items.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            result.value = array
        }, {scheduler: dvsUpdateScheduler(result as Ref<HTMLElement[]>)})

    return {$derived: true, ref: result as ComputedRef<HTMLElement[]>}
}

// Keep a set of all the DOM updates that need to happen. Duplicate requests are ignored.
const domUpdates: Set<Function> = new Set()

function scheduleDOMUpdate(el: HTMLElement, update: () => void): ReactiveEffect<void> {
    return effect(() => {
        // Don't update the node if it has just been deleted
        if ((el as WithCleanupData<HTMLElement>).$effects !== undefined) {
            update()
        }
    }, {scheduler: job => domUpdates.add(job)}) 
}

// Update the DOM after executing the given state update function.
function thenUpdateDOM(stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        console.log("----- Begin DOM update (event: FIXME) -----")
        // Update the essential state
        stateUpdate(...args)
        // Update the derived view state
        derivedSubtreeConstructionOrder.forEach(ref => {
            const job = derivedViewStateUpdateJobs.get(ref)
            if (job !== undefined) job()
        })
        derivedViewStateUpdateJobs.clear()
        // We're now ready to update the DOM
        domUpdates.forEach(f => f())
        domUpdates.clear()
    }
}

type WithCleanupData<E> = E & { $effects: ReactiveEffect<void>[], $subtreeRefs: Ref<HTMLElement[]>[] }

type SubRecordWithRefs<Keys extends keyof Element, Element> =
    { [K in Keys]: Element[K] | Ref<Element[K]> | DerivedViewState<Element[K]> }

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
    el_: Element,
    assignment: SubRecordWithRefs<AssKeys, Element>,
): WithCleanupData<Element> {
    // Create the array to store the effects that maintain the derived view state, and prepare
    // the list of subtree refs that need to be removed from derivedSubtreeConstructionOrder later.
    const el = el_ as WithCleanupData<Element>
    el.$effects = []
    el.$subtreeRefs = []
    for (const key in assignment) {
        const attrValue: any | Ref<any> | DerivedViewState<any> = assignment[key]
        // Specialized to Ref or DerivedAttribute:
        const scheduleAttributeUpdate = (attr: Ref<any>): ReactiveEffect<void> =>
            scheduleDOMUpdate(el, () => {
                el[(key as AssKeys)] =  attr.value
                console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                console.log(`  %c${key} = "${attr.value}"`, attributeStyle)
            })
        if (isRef(attrValue)) {
            el.$effects.push(scheduleAttributeUpdate(attrValue))
        }
        else if (isDerivedViewState(attrValue)) {
            // If the attribute value is derived view state, store the effect and subtree ref
            // that maintains the view state so that we can clean it up later.
            el.$effects.push(scheduleAttributeUpdate(attrValue.ref), attrValue.ref.effect)
            el.$subtreeRefs.push(attrValue.ref)
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
function attachChildren(el: WithCleanupData<HTMLElement>, children: HTMLChildren): void {
    for (const childGroup of children) {
        if (isDerivedViewState(childGroup)) {
            // Store the subtree ref so that it can be cleaned up later.
            el.$subtreeRefs.push(childGroup.ref)
            // Create a marker child so that when the ref is updated,
            // we know where we need to insert the new elements.
            const markerChild = document.createElement("div")
            markerChild.title = "group marker"
            markerChild.hidden = true
            el.appendChild(markerChild)
            // Stores children that are already in the DOM tree,
            // so that we can remove them when the ref is updated.
            const existingChildren: HTMLElement[] = []
            // Store the effect for this derived view state, and the corresponding DOM update
            // effect, so we can clean it up if/when this element is removed from the DOM tree.
            el.$effects.push(childGroup.ref.effect,
                scheduleDOMUpdate(el, () => {
                    console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                    for (const child of existingChildren) {
                        el.removeChild(child)
                        const childWithStuff = child as WithCleanupData<HTMLElement>

                        // We're removing the child, so destroy the child's own effects
                        const effects = childWithStuff.$effects
                        effects.forEach(stop)
                        // This marks the node as deleted so pending DOM update events don't run
                        ;(child as any).$effects = undefined

                        // Remove the child's derivedSubtrees from the list
                        const subtrees = childWithStuff.$subtreeRefs
                        subtrees.forEach(ref => derivedSubtreeConstructionOrder.delete(ref))

                        // Log the deletion of this child
                        console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                    }
                    existingChildren.length = 0
                    // Create a sequence of nodes to add
                    const newChildren = document.createDocumentFragment()
                    for (const child of childGroup.ref.value) {
                        newChildren.appendChild(child as HTMLElement)
                        existingChildren.push(child as HTMLElement)
                        // Log the addition of this child
                        console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                    }
                    // Add the nodes to the DOM
                    el.insertBefore(newChildren, markerChild)
                })
            )
        }
        // We have a non-reactive (static) element
        else {
            const childWithStuff = childGroup as WithCleanupData<HTMLElement>
            // Make sure we carry up effects from (static) child to parent so we can delete them
            el.$effects.push(...childWithStuff.$effects)
            el.$subtreeRefs.push(...childWithStuff.$subtreeRefs)
            el.appendChild(childGroup)
        }
    }
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof Element, Element extends HTMLElement>(
    name: string,
    attributes: SubRecordWithRefs<Keys, Element>,
): WithCleanupData<Element> {
    const el = document.createElement(name) as Element
    // Ensures that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // TODO: Unsafe... we're presuming all keys starting with "on" have a value of function type
            attributes[key] = thenUpdateDOM(attributes[key] as any) as any
        }
    }
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
    textContent: string | Ref<string> | DerivedViewState<string>,
    attributes: SubRecordWithRefs<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes)
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | Ref<string> | DerivedViewState<string>,
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
    const valueRef: string | Ref<string> | DerivedViewState<string> | undefined = attrsWithValue.value
    if (valueRef !== undefined && isRef(valueRef)) {
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

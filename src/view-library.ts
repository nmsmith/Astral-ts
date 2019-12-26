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

// Derived view nodes (constructed via $-prefixed functions) are VIRTUAL DOM NODES
// that produce concrete HTML (elements or attributes). They are considered owned
// by the view, must be cleaned up when they are removed from the view.
//
// Currently, there are two things to clean up: the effect() that maintains the 
// derived state (along with the corresponding effect which applies it to the DOM)
// and the entry in updateOrder which determines the order in which 
// the derived view state should be computed (top-down order).
interface DerivedViewNode<T> extends WithCleanupData<unknown> {
    $derived: true
    ref: Ref<T>
}

type WithCleanupData<E> = E & {
    // Effects that need to be disabled
    $effects: ReactiveEffect<void>[]
    // Keys that need to be removed from updateOrder
    $updateOrderKeys: (HTMLElement | DerivedViewNode<unknown>)[] 
    // Derived view nodes that need their own cleanup
    $descendentsToClean: DerivedViewNode<HTMLElement[]>[]
}

function isDerivedViewNode(value: unknown): value is DerivedViewNode<unknown> {
    return (value as DerivedViewNode<unknown>).$derived === true
}

// ECMA Sets are iterated according to insertion order, and have sublinear insert/delete time.
// All derived subtrees should be constructed (and registered) parent-first,
// which is an optimal order to run the update jobs in.
const updateOrder: Set<unknown> = new Set()
// A map from the derived view state to its (potential) update function,
// for each piece of view state that needs to be updated.
const domUpdateJobs: Map<unknown, Function> = new Map()
console.log("Watch this for memory leaks: ", updateOrder)

function scheduleDOMUpdate(key: WithCleanupData<unknown>, update: () => void): ReactiveEffect<void> {
    return effect(() => {
        // Don't update the node if it has just been deleted
        if (key.$effects !== undefined) {
            update()
        }
    }, {scheduler: job => domUpdateJobs.set(key, job)}) 
}

// A reactive attribute which is OWNED by the view.
// It will be destroyed if it is ever detached from the view tree.
export function $derived<T>(value: () => T): DerivedViewNode<T> {
    const state: DerivedViewNode<T> = {
        $derived: true,
        ref: ref(undefined) as Ref<T>,
        $effects: [],
        $updateOrderKeys: [],
        $descendentsToClean: [],
    }
    updateOrder.add(state)
    state.$updateOrderKeys.push(state)

    state.$effects.push(scheduleDOMUpdate(state, () => {
        console.log("%cDERIVED", elementStyle)
        state.ref.value = value() as any
    }))

    return state
}

// A reactive subtree/attribute of the view, determined by a condition.
export function $if<T>(
    condition: () => boolean,
    branches: {_then: () => T, _else: () => T},
): DerivedViewNode<T> {
    const _then = branches._then
    const _else = branches._else
    let conditionPrevious: boolean | undefined = undefined
    
    const state: DerivedViewNode<T> = {
        $derived: true,
        ref: ref(undefined) as Ref<T>,
        $effects: [],
        $updateOrderKeys: [],
        $descendentsToClean: [],
    }
    updateOrder.add(state)
    state.$updateOrderKeys.push(state)

    state.$effects.push(scheduleDOMUpdate(state, () => {
        console.log("%cIF", elementStyle)
        const conditionNow = condition()
        if (conditionNow === true && conditionPrevious !== true) {
            console.log("  switched to first branch")
            state.ref.value = _then() as any
        }
        else if (conditionNow === false && conditionPrevious !== false) {
            console.log("  switched to second branch")
            state.ref.value = _else() as any
        }
        else {
            console.log("  no change")
        }
        conditionPrevious = conditionNow
    }))

    return state
}

// A reactive subtree of the view, constructed from a list of data.
export function $for<T>(
    items: T[] | Ref<T[]>,
    f: (item: T, index: number) => HTMLElement[],
): DerivedViewNode<HTMLElement[]> {
    const state: DerivedViewNode<HTMLElement[]> = {
        $derived: true,
        ref: ref(undefined) as Ref<any>,
        $effects: [],
        $updateOrderKeys: [],
        $descendentsToClean: [],
    }
    updateOrder.add(state)
    state.$updateOrderKeys.push(state)

    state.$effects.push(isRef(items)
        ? scheduleDOMUpdate(state, () => {
            console.log("%cFOR", elementStyle)
            console.log("  all items changed (FIX ME)")
            const array: HTMLElement[] = []
            items.value.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            state.ref.value = array
        })
        : scheduleDOMUpdate(state, () => {
            console.log("%cFOR", elementStyle)
            console.log("  all items changed (FIX ME)")
            const array: HTMLElement[] = []
            items.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            state.ref.value = array
        }))

    return state
}

// Update the DOM after executing the given state update function.
function thenUpdateDOM(stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        console.log("----- Begin DOM update (event: FIXME) -----")
        // Update the essential state
        stateUpdate(...args)
        // Update the DOM
        updateOrder.forEach(ref => {
            const job = domUpdateJobs.get(ref)
            if (job !== undefined) job()
        })
        domUpdateJobs.clear()
    }
}

type SubRecordWithRefs<Keys extends keyof Element, Element> =
    { [K in Keys]: Element[K] | Ref<Element[K]> | DerivedViewNode<Element[K]> }

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
        const attrValue: any | Ref<any> | DerivedViewNode<any> = assignment[key]
        // Update the attribute from a ref or a derived view state
        const scheduleAttributeUpdate = (attr: Ref<any>): ReactiveEffect<void> =>
            scheduleDOMUpdate(el, () => {
                el[(key as AssKeys)] =  attr.value
                console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
                console.log(`  %c${key} = "${attr.value}"`, attributeStyle)
            })
        if (isRef(attrValue)) {
            el.$effects.push(scheduleAttributeUpdate(attrValue))
        }
        else if (isDerivedViewNode(attrValue)) {
            // Parent inherits cleanup from child
            el.$effects.push(scheduleAttributeUpdate(attrValue.ref), ...attrValue.$effects)
            el.$updateOrderKeys.push(...attrValue.$updateOrderKeys)
            // No derived subtrees to add
        }
        else {
            el[(key as AssKeys)] = attrValue
        }
    }
    return el
}

type HTMLChildrenWithCleanup =
    (WithCleanupData<HTMLElement> | DerivedViewNode<WithCleanupData<HTMLElement[]>>)[]

export type HTMLChildren =
    (HTMLElement | DerivedViewNode<HTMLElement[]>)[]

// TODO: Figure out how to properly move children around when the array changes.
function attachChildren(el: WithCleanupData<HTMLElement>, children: HTMLChildrenWithCleanup): void {
    // Every node that is permanently removed from the DOM must be cleaned up via this function
    function cleanUp(node: WithCleanupData<unknown>): void {
        // Destroy effects for the node's static subtree
        node.$effects.forEach(stop)
        // This marks the node as deleted so pending DOM update events don't run
        ;(node as any).$effects = undefined
        // Remove the derived view state for the node's static subtree
        node.$updateOrderKeys.forEach(key => updateOrder.delete(key))
        // Clean up the derived view state OF the derived view state
        node.$descendentsToClean.forEach(cleanUp)
    }

    for (const child of children) {
        if (isDerivedViewNode(child)) {
            const derivedChildren = child
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
                    cleanUp(child)
                    // Log the deletion of this child
                    console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                }
                currentChildGroup.length = 0
                // Create a sequence of nodes to add
                const newChildren = document.createDocumentFragment()
                for (const child of derivedChildren.ref.value) {
                    newChildren.appendChild(child as HTMLElement)
                    currentChildGroup.push(child as WithCleanupData<HTMLElement>)
                    // Log the addition of this child
                    console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
                }
                // Add the nodes to the DOM
                el.insertBefore(newChildren, markerChild)
            })

            // When el is removed from the DOM, this is what needs cleaning up
            el.$effects.push(updateChildren)
            el.$descendentsToClean.push(derivedChildren)
        }
        // We have a non-reactive (static) element
        else {
            el.appendChild(child)
            // The child will never be deleted directly, so pass on its cleanup stuff
            // to the parent so that the parent (or ancestor) can clean up.
            el.$effects.push(...child.$effects)
            el.$updateOrderKeys.push(...child.$updateOrderKeys)
            el.$descendentsToClean.push(...child.$descendentsToClean)     
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
    el.$effects = []
    // IMPORTANT: When we add an el to the update order, we must register it for deletion later
    el.$updateOrderKeys = [el]
    el.$descendentsToClean = []
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
    attachChildren(el, children as HTMLChildrenWithCleanup)
    return el
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: SubRecordWithRefs<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes)
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | Ref<string> | DerivedViewNode<string>,
    attributes: SubRecordWithRefs<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes)
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | Ref<string> | DerivedViewNode<string>,
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
    const valueRef: string | Ref<string> | DerivedViewNode<string> | undefined = attrsWithValue.value
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

import { Ref, ref, reactive, toRefs, computed, effect } from "@vue/reactivity"

// Keep a queue of all the effects that need running.
// TODO: Associate each unique effect with some kind of key so that we don't
// run the same effect several times (i.e. diff the same subtree several times).
const domUpdates: Function[] = []

export function scheduleEffect(node: () => void): void {
    // Create an effect that (by default) runs immediately, and registers any state that it
    // accesses as a dependency.
    // By default, the effect will be re-executed every time the value of a dependency changes.
    // If a scheduler is provided, the effect will instead invoke the scheduler whenever
    // the value of a dependency changes. The scheduler can then decide when to run the effect.
    effect(node, {scheduler: job => domUpdates.push(job)}) 
}
// Update the DOM after executing the given state update function.
// Updating the DOM synchronously prevents any race condition where (e.g.)
// the user can click a button to alter some state that no longer exists.
function withDOMUpdates(stateUpdate: () => void): () => void {
    return (): void => {
        stateUpdate()
        domUpdates.forEach(f => f())
        domUpdates.length = 0
    }
}

type TextContent = string | number | Ref<string | number>

// Type-safe assignment to EXISTING properties of the given object.
function assign<T, AssKeys extends keyof T>(object: T, assignment: Record<AssKeys, T[AssKeys]>): void {
    //Object.assign(object, assignment) // non-reactive assignment
    for (const key in assignment) {
        // If the assigned value is reactive, then schedule its reassignment
        // (DOM update) every time it changes.
        scheduleEffect(() => object[(key as AssKeys)] = assignment[key])
    }
}

function elementWithAttributes(elementName: string, attributes: Attri): HTMLElement {
    const el = document.createElement(elementName) as HTMLLinkElement
    Object.assign(el, {foo: 3})
    if (attributes.onClick !== undefined) el.onclick = withDOMUpdates(attributes.onClick)
    return el
}

// TODO: Figure out how to properly move children around when the array changes.
// TODO: Create a non-reactive (static) version of each of the DOM node constructors?
function attachChildren(el: HTMLElement, children: Ref<HTMLElement[]>): void {
    scheduleEffect(() => {
        while(el.firstChild !== null) {
            el.removeChild(el.firstChild)
        }
        for (const child of children.value) {
            el.appendChild(child as HTMLElement)
        }
    })
}

function attachTextContent(el: HTMLElement, textContent: TextContent) {
    switch (typeof text) {
        case "string":
        case "number":
            el.textContent = text.toString()
            break
        default:
            scheduleEffect(() => el.textContent = text.value.toString())
    }
}

export function div(attributes: ElementAttributes, children: Ref<HTMLElement[]>): HTMLElement {
    const el = document.createElement("div") as HTMLDivElement
    return interiorElement("div", attributes, children)
}

export function p(attributes: ElementAttributes, text: TextContent): HTMLElement {
    return leafElement("p", {}, text)
}

export function link(attributes: ElementAttributes, address: string, text: TextContent) {
    return leafElement("p", {...attributes, href: address})
}

export function br(): HTMLElement {
    return document.createElement("br")
}

export function button(attributes: ElementAttributes, label: TextContent): HTMLElement {
    return leafElement("button", attributes, label)
}
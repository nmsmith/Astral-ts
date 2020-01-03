import { Ref, isRef, effect, ReactiveEffect, stop , pauseTracking, resumeTracking} from "@vue/reactivity"

// Styles for debug printing
const updateMsgStyle = "font-size: 110%; font-weight: bold; color: blue; padding-top: 12px"
const elementStyle = "font-weight: bold"
const attributeChangedStyle = "color: #7700ff"
const textContentStyle = "color: #007700"

type EventHandler =
    | "oncut"
    | "onend"
    | "onLine"
    | "onblur"
    | "oncopy"
    | "ondrag"
    | "ondrop"
    | "onexit"
    | "onload"
    | "onmark"
    | "onmute"
    | "onopen"
    | "onplay"
    | "onshow"
    | "onzoom"
    | "onabort"
    | "onclick"
    | "onclose"
    | "onended"
    | "onenter"
    | "onerror"
    | "onfocus"
    | "oninput"
    | "onkeyup"
    | "onpaste"
    | "onpause"
    | "onreset"
    | "onstart"
    | "ontrack"
    | "onwheel"
    | "onbounce"
    | "oncached"
    | "oncancel"
    | "onchange"
    | "onfinish"
    | "ononline"
    | "onresize"
    | "onresult"
    | "onresume"
    | "onscroll"
    | "onseeked"
    | "onselect"
    | "onsubmit"
    | "ontoggle"
    | "onunload"
    | "onunmute"
    | "onupdate"
    | "onblocked"
    | "oncanplay"
    | "ondragend"
    | "onemptied"
    | "oninvalid"
    | "onkeydown"
    | "onloadend"
    | "onmessage"
    | "onmouseup"
    | "onnomatch"
    | "onoffline"
    | "onplaying"
    | "onseeking"
    | "onstalled"
    | "onstorage"
    | "onsuccess"
    | "onsuspend"
    | "ontimeout"
    | "onwaiting"
    | "onaddtrack"
    | "onaudioend"
    | "onauxclick"
    | "onboundary"
    | "onchecking"
    | "oncomplete"
    | "ondblclick"
    | "ondragexit"
    | "ondragover"
    | "onkeypress"
    | "onmouseout"
    | "onnoupdate"
    | "onobsolete"
    | "onpagehide"
    | "onpageshow"
    | "onpopstate"
    | "onprogress"
    | "onsoundend"
    | "ontouchend"
    | "oncuechange"
    | "ondragenter"
    | "ondragleave"
    | "ondragstart"
    | "onencrypted"
    | "onloadstart"
    | "onmousedown"
    | "onmousemove"
    | "onmouseover"
    | "onmsneedkey"
    | "onpointerup"
    | "onspeechend"
    | "ontouchmove"
    | "onupdateend"
    | "onafterprint"
    | "onaudiostart"
    | "onhashchange"
    | "onloadeddata"
    | "onmouseenter"
    | "onmouseleave"
    | "onmousewheel"
    | "onpointerout"
    | "onratechange"
    | "onsoundstart"
    | "onsourceopen"
    | "onstatsended"
    | "ontimeupdate"
    | "ontonechange"
    | "ontouchstart"
    | "onbeforeprint"
    | "oncontextmenu"
    | "ondatachannel"
    | "ondevicelight"
    | "ondownloading"
    | "onmspointerup"
    | "onpointerdown"
    | "onpointermove"
    | "onpointerover"
    | "onremovetrack"
    | "onselectstart"
    | "onsourceclose"
    | "onsourceended"
    | "onspeechstart"
    | "onstatechange"
    | "ontouchcancel"
    | "onupdatefound"
    | "onupdateready"
    | "onupdatestart"
    | "onanimationend"
    | "onaudioprocess"
    | "onbeforeunload"
    | "ondevicechange"
    | "ondevicemotion"
    | "onicecandidate"
    | "onmessageerror"
    | "onmsgestureend"
    | "onmsgesturetap"
    | "onmspointerout"
    | "onpointerenter"
    | "onpointerleave"
    | "onvolumechange"
    | "one-dimensional"
    | "onmsgesturehold"
    | "onmspointerdown"
    | "onmspointermove"
    | "onmspointerover"
    | "onpointercancel"
    | "ontransitionend"
    | "ontransitionrun"
    | "onupgradeneeded"
    | "onversionchange"
    | "onvoiceschanged"
    | "onvrdisplayblur"
    | "onwaitingforkey"
    | "onanimationstart"
    | "oncanplaythrough"
    | "ondurationchange"
    | "onlanguagechange"
    | "onloadedmetadata"
    | "onlocalcandidate"
    | "onmsgesturestart"
    | "onmsinertiastart"
    | "onmspointerenter"
    | "onmspointerleave"
    | "onprocessorerror"
    | "onvrdisplayfocus"
    | "onaddsourcebuffer"
    | "onanimationcancel"
    | "onfullscreenerror"
    | "onisolationchange"
    | "onmsgesturechange"
    | "onmspointercancel"
    | "onselectionchange"
    | "ontransitionstart"
    | "oncontrollerchange"
    | "onfullscreenchange"
    | "onpointerlockerror"
    | "onreadystatechange"
    | "onrejectionhandled"
    | "ontransitioncancel"
    | "onvisibilitychange"
    | "onvrdisplayconnect"
    | "onbufferedamountlow"
    | "ondeviceorientation"
    | "ongotpointercapture"
    | "onicecandidateerror"
    | "onkeystatuseschange"
    | "onnegotiationneeded"
    | "onorientationchange"
    | "onpointerlockchange"
    | "onvrdisplayactivate"
    | "onanimationiteration"
    | "onlostpointercapture"
    | "onmsgesturedoubletap"
    | "onremovesourcebuffer"
    | "onunhandledrejection"
    | "oncandidatewindowhide"
    | "oncandidatewindowshow"
    | "onvrdisplaydeactivate"
    | "onvrdisplaydisconnect"
    | "onMSVideoFormatChanged"
    | "ongatheringstatechange"
    | "onshippingoptionchange"
    | "onsignalingstatechange"
    | "oncandidatewindowupdate"
    | "onconnectionstatechange"
    | "onshippingaddresschange"
    | "onvrdisplaypresentchange"
    | "oncompassneedscalibration"
    | "onicegatheringstatechange"
    | "onsecuritypolicyviolation"
    | "oniceconnectionstatechange"
    | "onresourcetimingbufferfull"
    | "onMSVideoFrameStepCompleted"
    | "ondeviceorientationabsolute"
    | "onvrdisplaypointerrestricted"
    | "onMSVideoOptimalLayoutChanged"
    | "onselectedcandidatepairchange"
    | "onvrdisplaypointerunrestricted"

const eventHandlerNames = new Set([
    "oncut",
    "onend",
    "onLine",
    "onblur",
    "oncopy",
    "ondrag",
    "ondrop",
    "onexit",
    "onload",
    "onmark",
    "onmute",
    "onopen",
    "onplay",
    "onshow",
    "onzoom",
    "onabort",
    "onclick",
    "onclose",
    "onended",
    "onenter",
    "onerror",
    "onfocus",
    "oninput",
    "onkeyup",
    "onpaste",
    "onpause",
    "onreset",
    "onstart",
    "ontrack",
    "onwheel",
    "onbounce",
    "oncached",
    "oncancel",
    "onchange",
    "onfinish",
    "ononline",
    "onresize",
    "onresult",
    "onresume",
    "onscroll",
    "onseeked",
    "onselect",
    "onsubmit",
    "ontoggle",
    "onunload",
    "onunmute",
    "onupdate",
    "onblocked",
    "oncanplay",
    "ondragend",
    "onemptied",
    "oninvalid",
    "onkeydown",
    "onloadend",
    "onmessage",
    "onmouseup",
    "onnomatch",
    "onoffline",
    "onplaying",
    "onseeking",
    "onstalled",
    "onstorage",
    "onsuccess",
    "onsuspend",
    "ontimeout",
    "onwaiting",
    "onaddtrack",
    "onaudioend",
    "onauxclick",
    "onboundary",
    "onchecking",
    "oncomplete",
    "ondblclick",
    "ondragexit",
    "ondragover",
    "onkeypress",
    "onmouseout",
    "onnoupdate",
    "onobsolete",
    "onpagehide",
    "onpageshow",
    "onpopstate",
    "onprogress",
    "onsoundend",
    "ontouchend",
    "oncuechange",
    "ondragenter",
    "ondragleave",
    "ondragstart",
    "onencrypted",
    "onloadstart",
    "onmousedown",
    "onmousemove",
    "onmouseover",
    "onmsneedkey",
    "onpointerup",
    "onspeechend",
    "ontouchmove",
    "onupdateend",
    "onafterprint",
    "onaudiostart",
    "onhashchange",
    "onloadeddata",
    "onmouseenter",
    "onmouseleave",
    "onmousewheel",
    "onpointerout",
    "onratechange",
    "onsoundstart",
    "onsourceopen",
    "onstatsended",
    "ontimeupdate",
    "ontonechange",
    "ontouchstart",
    "onbeforeprint",
    "oncontextmenu",
    "ondatachannel",
    "ondevicelight",
    "ondownloading",
    "onmspointerup",
    "onpointerdown",
    "onpointermove",
    "onpointerover",
    "onremovetrack",
    "onselectstart",
    "onsourceclose",
    "onsourceended",
    "onspeechstart",
    "onstatechange",
    "ontouchcancel",
    "onupdatefound",
    "onupdateready",
    "onupdatestart",
    "onanimationend",
    "onaudioprocess",
    "onbeforeunload",
    "ondevicechange",
    "ondevicemotion",
    "onicecandidate",
    "onmessageerror",
    "onmsgestureend",
    "onmsgesturetap",
    "onmspointerout",
    "onpointerenter",
    "onpointerleave",
    "onvolumechange",
    "one-dimensional",
    "onmsgesturehold",
    "onmspointerdown",
    "onmspointermove",
    "onmspointerover",
    "onpointercancel",
    "ontransitionend",
    "ontransitionrun",
    "onupgradeneeded",
    "onversionchange",
    "onvoiceschanged",
    "onvrdisplayblur",
    "onwaitingforkey",
    "onanimationstart",
    "oncanplaythrough",
    "ondurationchange",
    "onlanguagechange",
    "onloadedmetadata",
    "onlocalcandidate",
    "onmsgesturestart",
    "onmsinertiastart",
    "onmspointerenter",
    "onmspointerleave",
    "onprocessorerror",
    "onvrdisplayfocus",
    "onaddsourcebuffer",
    "onanimationcancel",
    "onfullscreenerror",
    "onisolationchange",
    "onmsgesturechange",
    "onmspointercancel",
    "onselectionchange",
    "ontransitionstart",
    "oncontrollerchange",
    "onfullscreenchange",
    "onpointerlockerror",
    "onreadystatechange",
    "onrejectionhandled",
    "ontransitioncancel",
    "onvisibilitychange",
    "onvrdisplayconnect",
    "onbufferedamountlow",
    "ondeviceorientation",
    "ongotpointercapture",
    "onicecandidateerror",
    "onkeystatuseschange",
    "onnegotiationneeded",
    "onorientationchange",
    "onpointerlockchange",
    "onvrdisplayactivate",
    "onanimationiteration",
    "onlostpointercapture",
    "onmsgesturedoubletap",
    "onremovesourcebuffer",
    "onunhandledrejection",
    "oncandidatewindowhide",
    "oncandidatewindowshow",
    "onvrdisplaydeactivate",
    "onvrdisplaydisconnect",
    "onMSVideoFormatChanged",
    "ongatheringstatechange",
    "onshippingoptionchange",
    "onsignalingstatechange",
    "oncandidatewindowupdate",
    "onconnectionstatechange",
    "onshippingaddresschange",
    "onvrdisplaypresentchange",
    "oncompassneedscalibration",
    "onicegatheringstatechange",
    "onsecuritypolicyviolation",
    "oniceconnectionstatechange",
    "onresourcetimingbufferfull",
    "onMSVideoFrameStepCompleted",
    "ondeviceorientationabsolute",
    "onvrdisplaypointerrestricted",
    "onMSVideoOptimalLayoutChanged",
    "onselectedcandidatepairchange",
    "onvrdisplaypointerunrestricted",
])

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

interface DerivedFromChoice<T> {
    condition: () => boolean
    branches: {$then: () => T, $else: () => T}
}

export type WithIndex<T extends object> = T & {$index: number}

interface DerivedFromSequence<T, I extends object> {
    items: () => readonly I[]
    f: (item: WithIndex<I>) => T
}

export type DerivedAttribute<T> = (() => T) | DerivedFromChoice<T>

export type DerivedDocFragment<I extends object = object> =
      DerivedFromChoice<HTMLElement[]>
    | DerivedFromSequence<HTMLElement[], I>

function isFunction(value: unknown): value is Function {
    return typeof value === "function"
}

function isDerivedFromChoice(value: unknown): value is DerivedFromChoice<unknown> {
    return typeof (value as DerivedFromChoice<unknown>).condition !== "undefined"
}

function isDerivedFromSequence(value: unknown): value is DerivedFromSequence<unknown, any> {
    return typeof (value as DerivedFromSequence<unknown, any>).items !== "undefined"
}

export function $if<T>(
    condition: () => boolean,
    branches: {$then: () => T, $else: () => T},
): DerivedFromChoice<T> {
    return {condition: condition, branches: branches}
}

/**
 * WARNING: The elements of the array MUST be unique object references.
 * The DOM update code hashes the elements by their identity in order to
 * determine which elements have changed when the array is updated.
 */
export function $for<I extends object>(
    items: () => readonly I[],
    f: (item: WithIndex<I>) => HTMLElement[],
): DerivedFromSequence<HTMLElement[], I> {
    return {items: items, f: f}
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
let midUpdate = false
function thenUpdateDOM(eventName: string, stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        const event = args[0] as Event
        console.log(`%cDOM update ${++updateNumber}`, updateMsgStyle)
        console.log("Event:", event.type)
        console.log("Target:", event.target)
        if (midUpdate) {
            console.error("WARNING: Something has triggered a nested DOM update (such as the browser engine calling onblur() during child management).")
        }
        else {
            midUpdate = true
        }
        // Update the essential state
        stateUpdate(...args)
        // Update the DOM
        domUpdateJobs.forEach(jobSet => {
            jobSet.forEach(eff => {
                if (eff.active) eff()
            })
            jobSet.clear()
        })
        midUpdate = false
    }
}

// Hack a "class" attribute onto Elements for readability's sake
declare global {
    interface Element {
        "class": string
    }
}

// Defines a record of properties that can be assigned to an Element. If the property
// is an EventHandler, then it must be a plain old function. Otherwise, the property
// can be dynamically computed. If the property is something that can be made a
// two-way binding, (e.g. "value"), then if it is dynamic, it must be a Ref.
export type AttributeSpec<Keys extends keyof El, El extends Element> =
    { [K in Keys]: K extends EventHandler
        ? El[K]
        : K extends "value"
            ? (El[K] | Ref<El[K]>)
            : (El[K] | DerivedAttribute<El[K]>)
    }

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
    assignment: AttributeSpec<AssKeys, El>,
): Effectful<El> {
    function logAttributeChange(key: string, value: unknown): void {
        logChangeStart(el)
        console.log(`  %c${key} = "${value}"`, attributeChangedStyle)
    }
    for (let key in assignment) {
        const attrValue: unknown | Ref<unknown> | DerivedAttribute<unknown> = assignment[key]
        // We hacked a "class" attribute onto Elements; now we need to fix it
        if (key === "class") {
            key = "className" as Extract<AssKeys, string>
        }

        if (isRef(attrValue)) {
            scheduleDOMUpdate(el, () => {
                el[(key as AssKeys)] = attrValue.value
                logAttributeChange(key, attrValue.value)
            })
        }
        else if (!eventHandlerNames.has(key) && isFunction(attrValue)) { // is derived value
            scheduleDOMUpdate(el, () => {
                const newValue = attrValue()
                el[(key as AssKeys)] = newValue as any
                logAttributeChange(key, newValue)
            })
        }
        else if (isDerivedFromChoice(attrValue)) {
            const condition = attrValue.condition
            const $then = attrValue.branches.$then
            const $else = attrValue.branches.$else
            let conditionPrevious: boolean | undefined = undefined
            
            scheduleDOMUpdate(el, () => {
                const conditionNow = condition()
                if (conditionNow === true && conditionPrevious !== true) {
                    const newValue = $then()
                    el[(key as AssKeys)] = newValue as any
                    logAttributeChange(key, newValue)
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    const newValue = $else()
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
        pauseTracking()
        el.removeChild(child)
        resumeTracking()
        cleanUp(child)
        logRemove(child)
    }

    children.forEach(child => {
        if (isDerivedFromChoice(child)) {
            const marker = putFragmentMarker()
            let childrenAttachedHere: Effectful<HTMLElement>[] = []

            const condition = child.condition
            const $then = child.branches.$then
            const $else = child.branches.$else
            let conditionPrevious: boolean | undefined = undefined
        
            scheduleDOMUpdate(el, () => {  
                const conditionNow = condition()
                if (conditionNow === true && conditionPrevious !== true) {
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    // add
                    childrenAttachedHere = $then() as Effectful<HTMLElement>[]
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => {
                        pauseTracking()
                        el.insertBefore(child, marker)
                        resumeTracking()
                        logAdd(child)
                    })
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    // add
                    childrenAttachedHere = $else() as Effectful<HTMLElement>[]
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => {
                        pauseTracking()
                        el.insertBefore(child, marker)
                        resumeTracking()
                        logAdd(child)
                    })
                }
                conditionPrevious = conditionNow
            })
        }
        else if (isDerivedFromSequence(child)) {
            const marker = putFragmentMarker()
            let elementsCache: Map<unknown, Effectful<HTMLElement>[]> = new Map()

            const items = (child as DerivedFromSequence<Effectful<HTMLElement>[], object>).items
            const f = (child as DerivedFromSequence<Effectful<HTMLElement>[], object>).f

            // Temp benchmarking
            const childrenAttachedHere: Effectful<HTMLElement>[] = []

            scheduleDOMUpdate(el, () => {
                const fragment = document.createDocumentFragment()

                const createAllNewChildren = false
                if (createAllNewChildren) { // FOR BENCHMARKING ONLY
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    childrenAttachedHere.length = 0
                    // add
                    items().forEach((item, index) => {
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
                    items().forEach((item, index) => {
                        const existingElements = elementsCache.get(item)
                        if (existingElements === undefined) {
                            // Associate the item with a reactive index (it may be moved later)
                            const itemWithIndex = item as WithIndex<object>
                            itemWithIndex.$index = index
                            // Item is new; create and cache its DOM elements
                            const newElements = f(itemWithIndex)
                            pauseTracking()
                            fragment.append(...newElements)
                            resumeTracking()
                            newElementsCache.set(item, newElements)
                            newElementsForLogging.push(...newElements)
                        }
                        else { // Item is old; use its existing elements
                            // Update the item's index
                            (item as WithIndex<object>).$index = index
                            // Need to pause tracking since moving elements can
                            // cause onBlur() to be called.
                            pauseTracking()
                            fragment.append(...existingElements)
                            resumeTracking()
                            // Put the item in the new cache
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
                    pauseTracking()
                    el.insertBefore(fragment, marker)
                    resumeTracking()
                    elementsCache = newElementsCache
                }
            })
        }
        // We have a non-reactive (static) child
        else {
            pauseTracking()
            el.appendChild(child)
            resumeTracking()
        }
    })
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof El, El extends HTMLElement>(
    name: string,
    attributes: AttributeSpec<Keys, El>,
    children: HTMLChildren,
): Effectful<El> {
    const el = document.createElement(name) as Effectful<El>
    el.$effects = []
    domUpdateJobs.set(el, new Set())

    // Ensure that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (eventHandlerNames.has(key)) {
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
    attributes: AttributeSpec<Keys, HTMLDivElement>,
    children: HTMLChildren = [],
): HTMLDivElement {
    return element("div", attributes, children)
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: AttributeSpec<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes, [])
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes, [])
}

export function span<Keys extends keyof HTMLParagraphElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("span", attributes, [])
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLButtonElement> = {} as any,
): HTMLButtonElement {
    Object.assign(attributes, {textContent: textContent})
    return element("button", attributes, [])
}

export function input<Keys extends keyof HTMLInputElement>(
    attributes: AttributeSpec<Keys, HTMLInputElement> = {} as any,
): HTMLInputElement { 
    const attrs = attributes as AttributeSpec<Keys | "value" | "oninput", HTMLInputElement>
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

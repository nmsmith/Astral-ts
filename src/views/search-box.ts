import { toRefs } from "@vue/reactivity"
import { $if, $for, div, input, span } from "../libs/lib-view"

interface SearchResult<ResultValue> {
    readonly key: string
    readonly value: ResultValue
    readonly distance: number
}

export interface SearchBoxState<ResultValue> {
    selection: {isOccurring: false} | {
        isOccurring: true
        keyboard: number | "nothing"
        mouse: number | "nothing" | null // needs to be null; undefined breaks toRefs() (see commit 6ed50a2)
        textChanged: boolean
    }
    text: string
    resultSelected: ResultValue | null
// The user of this view should derive the results from the above state.
    readonly results: SearchResult<ResultValue>[]
}

export interface DeletableSearchResult {
    boxesToClear: Set<SearchBoxState<unknown>>
}

export interface NothingOption {
    text: string
    textStyle: string
}

export function searchBox<ResultValue extends DeletableSearchResult>(
    state: SearchBoxState<ResultValue>,
    options: {
        borderAlwaysVisible?: boolean // default: true
        blurOnSelect?: boolean // default: true
        inputTextStyle?: string
        unmatchingInputTextStyle?: string
        showNothingOption?: NothingOption // menu option for choosing no result
    }
): HTMLElement {
    // Fill in missing options
    const borderAlwaysVisible = options.borderAlwaysVisible !== false
    const blurOnSelect = options.blurOnSelect !== false
    const inputTextStyle = (options.inputTextStyle === undefined) ? "" : options.inputTextStyle
    const unmatchingInputTextStyle = (options.unmatchingInputTextStyle === undefined) ? "" : options.unmatchingInputTextStyle
    const nothingOptionExists = options.showNothingOption !== undefined

    function activeSelection(): number | "nothing" | undefined {
        if (state.selection.isOccurring) {
            if (state.selection.mouse === null) {
                return state.selection.keyboard
            }
            else {
                return state.selection.mouse
            }
        }
        else {
            return undefined
        }
    }
    // Input text style customization as specified in options
    function currentInputTextStyle(): string {
        const styleAsUnmatching = state.selection.isOccurring
            ? activeSelection() === "nothing"
            : state.resultSelected === null
        return styleAsUnmatching ? unmatchingInputTextStyle : inputTextStyle
    }
    function deselectResult(): void {
        if (state.resultSelected !== null) {
            state.resultSelected.boxesToClear.delete(state)
            state.resultSelected = null
        }
    }
    function selectResult(selection: number | "nothing"): void {
        // Deselect any previous result that may be selected
        deselectResult()

        if (selection !== "nothing") {
            state.text = state.results[selection].key
            state.resultSelected = state.results[selection].value
            console.log("SELECTED", state.text, state.resultSelected)
            state.resultSelected.boxesToClear.add(state)
        }
    }
    function disableSearch(): void {
        state.selection = {isOccurring: false}
    }
    function defocusInput(): void {
        /* eslint-disable @typescript-eslint/no-use-before-define */
        // Blur without calling the onblur event
        const f = inputEl.onblur
        inputEl.onblur = null
        inputEl.blur()
        inputEl.onblur = f
    }
    // The text of this input is hidden; it is displayed in a span instead.
    const inputEl = input ({
        class: () => "textBoxInput " + currentInputTextStyle() + (
            borderAlwaysVisible === true || state.selection.isOccurring
                ? " textBoxBorder"
                : " textBoxBorderOnHover" // this will apply a border to the span, not me
        ),
        autocomplete: "nope",
        autocapitalize: "off",
        type: "search",
        value: toRefs(state).text,
        onkeydown: (event: KeyboardEvent) => {
            if (state.selection.isOccurring) {
                if (event.key === "ArrowDown") {
                    if (state.results.length === 0) return // can't move

                    if (state.selection.mouse !== null) {
                        state.selection.keyboard = state.selection.mouse === "nothing"
                            ? 0
                            : state.selection.mouse + 1
                        state.selection.mouse = null
                    }
                    else if (state.selection.keyboard === "nothing") {
                        state.selection.keyboard = 0
                    }
                    else {
                        ++state.selection.keyboard
                    }
                    if (state.selection.keyboard >= state.results.length) {
                        state.selection.keyboard = state.results.length - 1
                    }
                    event.preventDefault() // don't move the cursor to end of input
                }
                else if (event.key === "ArrowUp") {
                    if (state.selection.mouse !== null) {
                        state.selection.keyboard = state.selection.mouse === "nothing"
                            ? "nothing"
                            : state.selection.mouse - 1
                        state.selection.mouse = null
                    }
                    else if (state.selection.keyboard !== "nothing") {
                        --state.selection.keyboard
                    }
                    if (state.selection.keyboard < 0) {
                        state.selection.keyboard = nothingOptionExists
                            ? "nothing"
                            : 0
                    }
                    event.preventDefault() // don't move the cursor to start of input
                }
                // Select and defocus
                else if (event.key === "Enter") {
                    selectResult(state.selection.keyboard)
                    if (blurOnSelect === true) {
                        disableSearch()
                        defocusInput()
                    }
                }
                // Consider tab-navigation to be selection
                else if (event.key === "Tab") {
                    selectResult(state.selection.keyboard)
                    disableSearch()
                    defocusInput()
                }
            }
        },
        oninput: () => {
            if (state.selection.isOccurring) {
                state.selection.textChanged = true // Must update this before asking for results
                state.selection.keyboard = state.results.length === 0 || (state.results[0].distance > 0 && nothingOptionExists)
                    ? "nothing"
                    : 0
                state.selection.mouse = null
            }
        },
        onfocus: () => {
            // Must set this before asking for results
            state.selection = {
                isOccurring: true,
                keyboard: 0,
                mouse: null,
                textChanged: false,
            }
            state.selection.keyboard = state.results.length === 0 || state.resultSelected === null
                    ? "nothing"
                    : 0
        },
        onblur: () => {
            if (state.selection.isOccurring) {
                if (state.selection.textChanged) {
                    deselectResult()
                }
                disableSearch()
            }
        },
    })
    return div ({class: "searchBox"}, [
        div ({class: () => "textBoxInputContext"}, [
            inputEl,
            // This span determines the input el's width
            span (() => (state.text.length > 0) ? state.text : " ", {
                class: () => "textBoxTextSizeMeasure " + currentInputTextStyle(),
            }),
        ]),
        div ({class: "searchResultsLocation"}, [ // searchResults div is positioned relative to here
            $if (() => state.selection.isOccurring && (nothingOptionExists || state.results.length > 0), {
                $then: () => {
                    const resultEl = (text: string, textClass: string, index: () => number | "nothing"): HTMLElement =>
                        div ({
                            class:
                                $if (() => activeSelection() === index(), {
                                    $then: () => "searchResult highlighted",
                                    $else: () => "searchResult",
                                }),
                            onmouseenter: () => (state.selection as {mouse: number | "nothing"}).mouse = index(),
                            onclick: () => {
                                const i = index()
                                if (state.selection.isOccurring) {
                                    state.selection.keyboard = i
                                    state.selection.mouse = i
                                }
                                selectResult(i)
                                if (blurOnSelect === true) {
                                    disableSearch()
                                    defocusInput()
                                }
                            },
                        }, [
                            span (() => text, {class: "noWrap " + textClass}),
                        ])
                    return [
                        div ({
                            class: "searchResults",
                            // Prevent the "blur" event from occurring when the dropdown is clicked
                            onmousedown: event => event.preventDefault(),
                            onmouseleave: () => (state.selection as {mouse: null}).mouse = null,
                        }, [
                            $if (() => nothingOptionExists, {
                                $then: () => [resultEl (
                                    (options.showNothingOption as NothingOption).text as string,
                                    (options.showNothingOption as NothingOption).textStyle as string,
                                    () => "nothing",
                                )],
                                $else: () => [],
                            }),
                            $for (() => state.results, result => [
                                resultEl (result.key, "", () => nothingOptionExists ? (result.$index + 1) : result.$index),
                            ]),
                        ]),
                    ]
                },
                $else: () => [],
            }),

        ]),
    ])
}
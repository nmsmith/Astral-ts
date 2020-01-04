import { toRefs } from "@vue/reactivity"
import { $if, $for, div, input, span } from "../libs/lib-view"

interface SearchResult {
    readonly key: string
    readonly distance: number
}

export interface SearchBoxState<SearchResultType extends SearchResult> {
    selection: {isOccurring: false} | {
        isOccurring: true
        keyboard: number | "nothing"
        mouse: number | "nothing" | null // needs to be null; undefined breaks toRefs() (see commit 6ed50a2)
        textChanged: boolean
    }
    text: string
    nothingSelected: boolean
    readonly resultsToShow: SearchResultType[]
}

export interface NothingOption {
    text: string
    textStyle: string
}

export function searchBox<SearchResultType extends SearchResult>(
    search: SearchBoxState<SearchResultType>,
    options: {
        borderAlwaysVisible?: boolean // default: true
        blurOnSelect?: boolean // default: true
        inputTextStyle?: string
        unmatchingInputTextStyle?: string
        showNothingOption?: NothingOption // menu option for choosing no result
        onActive?: () => void
        onSelect?: (result: SearchResultType) => boolean // return whether the selection was accepted
        onNothingSelected?: () => boolean // return whether the non-selection was accepted
    }
): HTMLElement {
    // Fill in missing options
    const borderAlwaysVisible = options.borderAlwaysVisible !== false
    const blurOnSelect = options.blurOnSelect !== false
    const inputTextStyle = (options.inputTextStyle === undefined) ? "" : options.inputTextStyle
    const unmatchingInputTextStyle = (options.unmatchingInputTextStyle === undefined) ? "" : options.unmatchingInputTextStyle
    
    function activeSelection(): number | "nothing" | undefined {
        if (search.selection.isOccurring) {
            if (search.selection.mouse === null) {
                return search.selection.keyboard
            }
            else {
                return search.selection.mouse
            }
        }
        else {
            return undefined
        }
    }
    // Input text style customization as specified in options
    function currentInputTextStyle(): string {
        const styleAsUnmatching = search.selection.isOccurring
            ? activeSelection() === "nothing"
            : search.nothingSelected
        return styleAsUnmatching ? unmatchingInputTextStyle : inputTextStyle
    }
    function offerResult(selection: number | "nothing"): void {
        if (selection === "nothing") {
            if (options.onNothingSelected !== undefined && options.onNothingSelected()) {
                search.nothingSelected = true
            }
        }
        else if (options.onSelect !== undefined) {
            if (options.onSelect(search.resultsToShow[selection])) {
                search.text = search.resultsToShow[selection].key
                search.nothingSelected = false
            }
        }
    }
    function disableSearch(): void {
        search.selection = {isOccurring: false}
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
        class: () => "searchBoxInput " + currentInputTextStyle() + (
            borderAlwaysVisible === true || search.selection.isOccurring
                ? " searchBorder"
                : " searchBorderOnHover"
        ),
        autocomplete: "nope",
        value: toRefs(search).text,
        onkeydown: (event: KeyboardEvent) => {
            if (search.selection.isOccurring) {
                if (event.key === "ArrowDown") {
                    if (search.resultsToShow.length === 0) return // can't move

                    if (search.selection.mouse !== null) {
                        search.selection.keyboard = search.selection.mouse === "nothing"
                            ? 0
                            : search.selection.mouse + 1
                        search.selection.mouse = null
                    }
                    else if (search.selection.keyboard === "nothing") {
                        search.selection.keyboard = 0
                    }
                    else {
                        ++search.selection.keyboard
                    }
                    if (search.selection.keyboard >= search.resultsToShow.length) {
                        search.selection.keyboard = search.resultsToShow.length - 1
                    }
                    event.preventDefault() // don't move the cursor to end of input
                }
                else if (event.key === "ArrowUp") {
                    if (search.selection.mouse !== null) {
                        search.selection.keyboard = search.selection.mouse === "nothing"
                            ? "nothing"
                            : search.selection.mouse - 1
                        search.selection.mouse = null
                    }
                    else if (search.selection.keyboard !== "nothing") {
                        --search.selection.keyboard
                    }
                    if (search.selection.keyboard < 0) {
                        search.selection.keyboard = options.showNothingOption === undefined
                            ? 0
                            : "nothing"
                    }
                    event.preventDefault() // don't move the cursor to start of input
                }
                // Select and defocus
                else if (event.key === "Enter") {
                    offerResult(search.selection.keyboard)
                    if (blurOnSelect === true) {
                        disableSearch()
                        defocusInput()
                    }
                }
                // Consider tab-navigation to be selection
                else if (event.key === "Tab") {
                    offerResult(search.selection.keyboard)
                    disableSearch()
                    defocusInput()
                }
            }
        },
        oninput: () => {
            if (search.selection.isOccurring) {
                search.selection.keyboard = search.resultsToShow.length === 0 || (search.resultsToShow[0].distance > 0 && options.showNothingOption !== undefined)
                    ? "nothing"
                    : 0
                search.selection.mouse = null
                search.selection.textChanged = true
            }
        },
        onfocus: () => {
            search.selection = {
                isOccurring: true,
                keyboard: search.resultsToShow.length === 0 || search.nothingSelected
                    ? "nothing"
                    : 0,
                mouse: null,
                textChanged: false,
            }
            if (options.onActive !== undefined) options.onActive()
        },
        onblur: () => {    
            // Check if the search is active, and therefore we need to clean up
            if (search.selection.isOccurring) {
                if (search.selection.textChanged) {
                    if (options.onNothingSelected !== undefined) options.onNothingSelected()
                    search.nothingSelected = true
                }
                disableSearch()
            }
        },
    })
    return div ({class: "searchBox"}, [
        div ({class: () => "searchBoxInputContext"}, [
            inputEl,
            // This span determines the input el's width
            span (() => (search.text.length > 0) ? search.text : "   ", {
                class: () => "searchBoxTextSizeMeasure " + currentInputTextStyle(),
            }),
        ]),
        div ({class: "searchResultsLocation"}, [ // searchResults div is positioned relative to here
            $if (() => search.selection.isOccurring && (search.resultsToShow.length > 0 || options.showNothingOption !== undefined), {
                $then: () => {
                    const resultEl = (text: string, textClass: string, index: () => number | "nothing"): HTMLElement =>
                        div ({
                            class:
                                $if (() => activeSelection() === index(), {
                                    $then: () => "searchResult highlighted",
                                    $else: () => "searchResult",
                                }),
                            onmouseenter: () => (search.selection as {mouse: number | "nothing"}).mouse = index(),
                            onclick: () => {
                                const i = index()
                                if (search.selection.isOccurring) {
                                    search.selection.keyboard = i
                                    search.selection.mouse = i
                                }
                                offerResult(i)
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
                            onmouseleave: () => (search.selection as {mouse: null}).mouse = null,
                        }, [
                            $if (() => options.showNothingOption !== undefined, {
                                $then: () => [resultEl (
                                    (options.showNothingOption as NothingOption).text as string,
                                    (options.showNothingOption as NothingOption).textStyle as string,
                                    () => "nothing",
                                )],
                                $else: () => [],
                            }),
                            $for (() => search.resultsToShow, result => [
                                resultEl (result.key, "", () => result.$index),
                            ]),
                        ]),
                    ]
                },
                $else: () => [],
            }),

        ]),
    ])
}
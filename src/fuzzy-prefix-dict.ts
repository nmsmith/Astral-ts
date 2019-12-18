/**
 * A dictionary that can perform a fuzzy lookup of words matching a string
 * key within a given Damerau-Levenshtein (edit) distance. The dictionary
 * stores its keys using a prefix tree (trie). Key search is performed by
 * incrementally maintaining the diagonal of an edit distance table. If 
 * k is the length of the lookup key, d is the edit distance tolerance,
 * and n is the number of characters stored in the trie, then the runtime
 * is at most O(k * d * n). However, in practice most of the trie will be
 * not be traversed since the corresponding strings will exceed d. Thus
 * runtime will be O(k * d * t) for some small number of traversed
 * characters. Since k, d, and t are all small, this should be very fast.
 */

type FuzzyDictNode<Value> = FuzzyDictInterior<Value> | FuzzyDictLeaf<Value>

interface FuzzyDict<Value> {
    next: FuzzyDictNode<Value>[]
}

export type T<Value> = FuzzyDict<Value>

interface FuzzyDictInterior<Value> {
    prefix: string // consider this an edge label
    type: "Interior"
    next: FuzzyDictNode<Value>[]
}

interface FuzzyDictLeaf<Value> {
    prefix: string // consider this an edge label
    type: "Leaf"
    value: Value
}

export function empty<Value>(): FuzzyDict<Value> {
    return {next: []}
}

// Returns the index at which the two strings differ.
// If they agree on all their characters, then the
// differing point is the end of the shortest string.
function differIndex(x: string, y: string): number {
    const endIndex = Math.min(x.length, y.length)
    let differIndex = 0
    while (differIndex < endIndex) {
        if (x[differIndex] !== y[differIndex]) {
            break
        }
        ++differIndex
    }
    return differIndex
}

/// Insert a key/value pair into the tree. If the key already
/// exists, its corresponding value will be overwritten.
/// (N.B. we can modify the behaviour to allow bag semantics, if
/// we want multiple identifiers to be mappable to the same name).
export function insert<Value>(tree: FuzzyDict<Value>, key: string, value: Value): void {
    const children = tree.next
    for (let childIndex = 0; childIndex < children.length; ++childIndex) {
        const child = children[childIndex]
        const cutIndex = differIndex(key, child.prefix)
        
        // If the strings match over the whole child prefix (including the possibility
        // of the strings being identical), and there's more tree to explore
        if (cutIndex === child.prefix.length && child.type === "Interior") {
            // Go deeper
            const disagreedSuffixKey = key.slice(cutIndex)
            insert(child, disagreedSuffixKey, value)
            return
        }
        // If the strings are identical, and the child is a leaf
        else if (cutIndex === child.prefix.length && cutIndex === key.length && child.type === "Leaf") {
            // Overwrite the existing value
            child.value = value
            return
        }
        // If the keys are completely different, look at the next child
        else if (cutIndex === 0) {
            continue
        }
        // We should insert at this position
        else {
            const agreedPrefix = child.prefix.slice(0, cutIndex)
            const disagreedSuffixKey = key.slice(cutIndex)
            const disagreedSuffixTree = child.prefix.slice(cutIndex)
            // Create new node for the value to be inserted
            const newLeafNode: FuzzyDictLeaf<Value> = {
                prefix: disagreedSuffixKey,
                type: "Leaf",
                value: value
            }
            // Update existing node
            child.prefix = disagreedSuffixTree
            // Create a new parent for both of them
            const newInteriorNode: FuzzyDictInterior<Value> = {
                prefix: agreedPrefix,
                type: "Interior",
                next: [newLeafNode, child]
            }
            children.set(childIndex, newInteriorNode)
            // Job done
            return
        }
    }
    // If we've reached here, then none of the children partially
    // matched our key, so we should insert the key as a new child.
    tree.next.push({prefix: key, type: "Leaf", value: value})
}

export interface SearchResult<Value> {
    key: string
    value: Value
    distance: number
}

export function fuzzySearch<Value>(tree: FuzzyDict<Value>, key: string, errorTolerance: number): SearchResult<Value>[] {
    const matches: SearchResult<Value>[] = []
    // Special case for when the key is length zero (don't need a DP table)
    if (key.length === 0) {
        tree.next.forEach(child => collectStrings(child, child.prefix, 0))
        return matches
    }

    // Set up the dynamic programming memo table.
    // We're only computing the table diagonal of width proportional to the error tolerance.
    // If we are able to hit the bottom row of the table with one of the entries being less
    // than the tolerance, then we have found an acceptable match between the key and a prefix.
    const tableWidth = key.length + 1 + errorTolerance
    const tableHeight = 2*errorTolerance + 1

    class Table {
        private readonly table: number[]

        constructor() {
            // We only store a subset of the table.
            // This is technically the table diagonal reshaped into a rectangle.
            this.table = Array<number>(tableWidth * tableHeight)
            // Initialize the first column of the table
            for (let i = 0; i < tableHeight; ++i) {
                this.table[i] = i - errorTolerance
            }
        }
        // Given coords into the full table, get an index in the sparse table.
        // Gives a garbage answer if you enter coordinates outside the diagonal.
        private tableIndex(row: number, column: number): number {
            const xCoord = column
            const yCoord = row + errorTolerance - column
            return yCoord + tableHeight * xCoord
        }

        // Returns whether the point is actually represented in the array
        private pointInBounds(row: number, column: number): boolean {
            return Math.abs(row - column) <= errorTolerance
        }

        get(row: number, column: number): number {
            return this.pointInBounds(row, column)
                ? this.table[this.tableIndex(row, column)]
                : Infinity
        }

        // Assume the code that uses this setter is iterating over the diagonal
        // correctly: i.e. it will not try to set outside the valid range.
        set(row: number, column: number, value: number) {
            this.table[this.tableIndex(row, column)] = value
        }
    }

    const table = new Table()
    
    function fuzzySearchStep(tree: FuzzyDict<Value>, currentPath: string, firstColumn: number): void {
        const children = tree.next
        nextChild:
        for (let childIndex = 0; childIndex < children.length; ++childIndex) {
            const child = children[childIndex]
            //const cutIndex = differIndex(key, child.prefix)
            const numPrefixChars = child.prefix.length
            for (let columnOffset = 0; columnOffset < numPrefixChars; ++columnOffset) {
                const column = firstColumn + columnOffset
                // First few columns creep into negative rows, so round up to 0
                const firstRowUnchecked = column - errorTolerance
                const firstRow = Math.max(0, firstRowUnchecked) 
                // Later columns can exceed key length, so round down
                const lastRowUnchecked = firstRowUnchecked + tableHeight
                const lastRow = Math.min(lastRowUnchecked, key.length)

                let minCost = Infinity
                // Fill the column
                for (let row = firstRow; row <= lastRow; ++row) {
                    // Fill the table cell using the Damerau-Levenshtein formula.
                    // Edge cases are covered by table.get, which returns Infinity
                    // if asked for a cell outside its bounds.
                    const insertion = table.get(row-1, column) + 1
                    const deletion = table.get(row, column-1) + 1
                    const substitution = row > 0 // need to check this to safely index "key"
                        ? ( table.get(row-1, column-1) + (
                                key[row-1] === child.prefix[columnOffset]
                                    ? 0
                                    : 1
                            )
                          )
                        : Infinity
                    const swap = (
                           row > 1
                        && column > 1
                        && key[row-1] ===
                            // If we're only looking at the first char of the
                            // current prefix, we need to look at the currentPath
                            (columnOffset===0
                                ? currentPath[currentPath.length-1]
                                : child.prefix[columnOffset-1]
                            )
                        && key[row-2] === child.prefix[columnOffset]
                        )
                        ? table.get(row-2, column-2) + 1
                        : Infinity
                    
                    const cost = Math.min(insertion, deletion, substitution, swap)
                    // Update the table and keep track of the minimum cost in the column
                    table.set(row, column, cost)
                    minCost = Math.min(minCost, cost)
                }
                
                // If all the values in the column exceeded our error tolerance,
                // then any strings with this prefix are NOT sufficiently similar.
                // Give up searching this subtree.
                if (minCost > errorTolerance) {
                    continue nextChild
                }
                // If we've matched the entire key and we're within the error tolerance,
                // then all strings with this prefix are sufficiently similar.
                // Collect all key/value pairs for this subtree.
                else if (lastRow === key.length && table.get(lastRow, column) <= errorTolerance) {
                    const newPath = currentPath + child.prefix
                    collectStrings(child, newPath, table.get(lastRow, column))
                    continue nextChild
                }
                else continue // Move onto the next character in the prefix
            }

            // If we've reached here, then we've not yet compared against the entire key.
            // Continue looking in this child's children, if they exist.
            if (child.type === "Leaf") {
                return // Nothing left in this subtree
            }
            else {
                const newPath = currentPath + child.prefix
                fuzzySearchStep(child, newPath, firstColumn + numPrefixChars)
            }
        }
    }

    // Collect all the key/value pairs for the given subtree.
    // This key/value pairs differ from the search key by the given distance.
    function collectStrings(tree: FuzzyDictNode<Value>, currentPath: string, distance: number) {
        if (tree.type === "Leaf") {
            matches.push({
                key: currentPath,
                value: tree.value,
                distance: 0,
            })
        }
        else {
            tree.next.forEach(child => collectStrings(child, currentPath + child.prefix, distance))
        }
    }

    fuzzySearchStep(tree, "", 1)
    return matches
}
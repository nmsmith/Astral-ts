/**
 * A dictionary that can perform a fuzzy lookup of word prefixes matching a string
 * key within a given Damerau-Levenshtein (edit) distance. The dictionary
 * stores its keys using a prefix tree (trie). Key search is performed by
 * incrementally maintaining the diagonal of an edit distance table. If 
 * k is the length of the lookup key, d is the edit distance tolerance,
 * and n is the number of characters stored in the trie, then the runtime
 * is at most O(d * n). However, in practice most of the trie will be
 * not be traversed since the corresponding strings will exceed d. Thus
 * runtime will be O(d * t) for some small number of traversed characters.
 * Since k, d, and t are all small, this should be very fast.
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
    val: Value
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
                val: value
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
    tree.next.push({prefix: key, type: "Leaf", val: value})
}

export interface SearchResult<Value> {
    key: string
    val: Value
    distance: number
}

export function fuzzySearch<Value>(tree: FuzzyDict<Value>, key: string, errorTolerance: number): SearchResult<Value>[] {
    const matches: SearchResult<Value>[] = []
    // Special case for when the key is length zero (don't need a memo table)
    if (key.length === 0) {
        tree.next.forEach(child => collectStrings(child, "", 0))
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
    
    function fuzzySearchStep(
        node: FuzzyDictNode<Value>,
        currentPath: string,       // Prefix up to the current node
        firstColumn: number,       // Next column of the memo table that needs to be filled
        bestSolutionFound: number, // If the full key has aleady been matched, this is the minimum distance computed so far
        ): void {
        const prefixLength = node.prefix.length
        // Fill the columns of the memo table corresponding to this node
        for (let columnOffset = 0; columnOffset < prefixLength; ++columnOffset) {
            const column = firstColumn + columnOffset
            // First few columns creep into negative rows, so round up to 0
            const firstRowUnchecked = column - errorTolerance
            const firstRow = Math.max(0, firstRowUnchecked) 
            // Later columns can exceed key length, so round down
            const lastRowUnchecked = firstRowUnchecked + tableHeight - 1
            const lastRow = Math.min(lastRowUnchecked, key.length)

            let minCostColumn = Infinity
            // Fill one column of the memo table
            for (let row = firstRow; row <= lastRow; ++row) {
                // Fill the table cell using the Damerau-Levenshtein formula. Edge cases are covered
                // by table.get, which returns Infinity if asked for a cell outside its bounds.
                const insertion = table.get(row-1, column) + 1
                const deletion = table.get(row, column-1) + 1
                const substitution = row > 0 // need to check this to safely index "key"
                    ? ( table.get(row-1, column-1) + (
                            key[row-1] === node.prefix[columnOffset]
                                ? 0
                                : 1
                        )
                        )
                    : Infinity
                const swap = (
                        row > 1
                    && column > 1
                    && key[row-1] ===
                        // If we're currently looking at the first char of the current prefix,
                        // we will find the previous char at the end of currentPath.
                        (columnOffset===0
                            ? currentPath[currentPath.length-1]
                            : node.prefix[columnOffset-1]
                        )
                    && key[row-2] === node.prefix[columnOffset]
                    )
                    ? table.get(row-2, column-2) + 1
                    : Infinity
                
                const cost = Math.min(insertion, deletion, substitution, swap)
                // Update the table and keep track of the minimum cost in the column
                table.set(row, column, cost)
                minCostColumn = Math.min(minCostColumn, cost)
            }
            
            // If all the values in the column exceeded our error tolerance,
            // then any strings with this prefix are NOT sufficiently similar.
            // Stop searching this subtree, but collect results if we previously
            // found this subtree to be within tolerance.
            if (minCostColumn > errorTolerance) {
                if (bestSolutionFound < Infinity) {
                    collectStrings(node, currentPath, bestSolutionFound)
                }
                return // Move onto the next sibling node
            }
            // If we've matched the entire key and we're within the error tolerance
            else if (lastRow === key.length && table.get(lastRow, column) <= errorTolerance) {
                // Log this new solution
                bestSolutionFound = Math.min(table.get(lastRow, column), bestSolutionFound)
                // If we've fully filled the table, take the best
                // solution and collect results for this subtree.
                if (firstRow === key.length) {
                    collectStrings(node, currentPath, bestSolutionFound)
                    return // Move onto the next sibling node
                }
                // Otherwise keeping filling the table in search of an even better solution
                else continue
            }
            // Else move onto the next character in the prefix
            else continue
        }

        // If we've reached here, then we've reached the end of
        // this node's prefix but haven't yet filled the table.
        if (node.type === "Interior") {
            // Continue looking in this node's children
            const newPath = currentPath + node.prefix
            const newFirstColumn = firstColumn + prefixLength
            node.next.forEach(child => fuzzySearchStep(child, newPath, newFirstColumn, bestSolutionFound))
        }
        else {
            // Dead end, so if we've found a solution, we should accept it
            if (bestSolutionFound < Infinity) {
                matches.push({
                    key: currentPath + node.prefix,
                    val: node.value,
                    distance: bestSolutionFound,
                })
            }
            return // Move onto the next sibling node
        }
    }

    // Collect all the key/value pairs for the given subtree.
    // This key/value pairs differ from the search key by the given distance.
    function collectStrings(node: FuzzyDictNode<Value>, currentPath: string, distance: number) {
        const newPath = currentPath + node.prefix
        if (node.type === "Leaf") {
            matches.push({
                key: newPath,
                val: node.value,
                distance: distance,
            })
        }
        else {
            node.next.forEach(child => collectStrings(child, newPath, distance))
        }
    }

    tree.next.forEach(child => fuzzySearchStep(child, "", 1, Infinity))
    return matches
}
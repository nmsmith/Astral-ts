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
            children[childIndex] = newInteriorNode
            // Job done
            return
        }
    }
    // If we've reached here, then none of the children partially
    // matched our key, so we should insert the key as a new child.
    tree.next.push({prefix: key, type: "Leaf", value: value})
}

interface SearchResult<Value> {
    key: string
    value: Value
    distance: number
}

export function fuzzySearch<Value>(tree: FuzzyDict<Value>, key: string): SearchResult<Value>[] {
    const matches: SearchResult<Value>[] = []
    
    function fuzzySearchStep(tree: FuzzyDict<Value>, key: string, currentPath: string): void {
        const children = tree.next
        for (let childIndex = 0; childIndex < children.length; ++childIndex) {
            const child = children[childIndex]
            const cutIndex = differIndex(key, child.prefix)
            
            // If the strings match over the whole child prefix (including the possibility
            // of the strings being identical), and there's more tree to explore
            if (cutIndex === child.prefix.length && child.type === "Interior") {
                // Go deeper
                const disagreedSuffixKey = key.slice(cutIndex)
                const path = key.slice(0, cutIndex)
                fuzzySearchStep(child, disagreedSuffixKey, path)
            }
            // If the strings are identical, and the child is a leaf
            else if (cutIndex === child.prefix.length && cutIndex === key.length && child.type === "Leaf") {
                // Collect the value
                matches.push({
                    key: currentPath + key,
                    value: child.value,
                    distance: 0})
            }
            // The key doesn't match the child prefix, try another child
            else {
                continue
            }
        }
    }

    fuzzySearchStep(tree, key, "")
    return matches
}
export type Obj = {type: "constant", name: string} | {type: "variable", name: string}

export interface Fact {
    readonly sign: "positive" | "negative"
    readonly relation: string
    readonly objects: Obj[]
}

export interface Rule {
    readonly head: Fact
    readonly body: Fact[]
}

export type SingleNode = {type: "node", relation: string}

export type RecursiveGroup = {type: "recursiveGroup", relations: Set<string>}

export type Component =
      SingleNode
    | RecursiveGroup

// This constructs a dependency graph of all the strongly connected components
// in the given set of relations. We call the non-trivial components "recursive groups".
// The components are returned in a reverse topological order. We use Tarjan's algorithm to
// do this. Because of the way rules are defined, we technically traverse all edges "backwards".
export function relationDependencyGraph(rules: Rule[]): Component[] {
    // Because a relation may be defined across multiple rules,
    // we first need to group all rules for a relation together.
    const nodes = new Map<string, Fact[][]>()
    for (const rule of rules) {
        const entry = nodes.get(rule.head.relation)
        if (entry === undefined) {
            nodes.set(rule.head.relation, [rule.body])
        }
        else {
            entry.push(rule.body)
        }
    }
    // For keeping track of the "depth" at which we saw a node in the active call stack.
    const depths = new Map<string, number>()
    const visitedStack: string[] = []
    const components: Component[] = []

    function tarjan(myDepth: number, nodeName: string): number {
        depths.set(nodeName, myDepth)
        visitedStack.push(nodeName)
        const successors = nodes.get(nodeName)
        let lowLink = myDepth
        // Track whether this connected component is trivial (one node, no cycles),
        // or whether there's a cycle.
        let cycleFound = false
        if (successors !== undefined) {
            for (const premises of successors) {
                for (const fact of premises) {
                    const itsDepth = depths.get(fact.relation)
                    if (itsDepth === undefined) {
                        // It's not yet visited
                        const itsLowLink = tarjan(myDepth + 1, fact.relation)
                        if (itsLowLink <= myDepth) {
                            // It's part of the same connected component as me
                            lowLink = Math.min(lowLink, itsLowLink)
                            cycleFound = true
                        }
                        else {
                            // It's in a newly formed connected component
                            // (and therefore a topological successor)
                        }
                    }
                    else if (itsDepth >= 0) {
                        // It's currently on the stack
                        lowLink = Math.min(lowLink, itsDepth)
                        cycleFound = true
                    }
                    else { // depth is NaN
                        // It's in another pre-connected component
                        // (and therefore a topological successor)
                    }
                }
            }
        }

        if (lowLink === myDepth) {
            // This node started a connected component.
            if (cycleFound) {
                // Gather all the other nodes.
                const component = new Set<string>()
                let n: string
                do {
                    n = visitedStack.pop() as string
                    depths.set(n, NaN)
                    component.add(n)
                }
                while (n !== nodeName)
                components.push({type: "recursiveGroup", relations: component})
            }
            else {
                // The current node is the whole component.
                const n = visitedStack.pop() as string
                depths.set(n, NaN)
                components.push({type: "node", relation: n})
            }
        }
        
        return lowLink
    }

    // Start a depth-first search from each yet-to-be-visited node
    for (const node of nodes.keys()) {
        if (depths.get(node) === undefined) {
            tarjan(0, node)
        }
    }

    return components
}